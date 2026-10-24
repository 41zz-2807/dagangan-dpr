"""Struk penjualan: render struk PDF 80mm (WeasyPrint) + halaman publik HTML."""

from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from html import escape
from io import BytesIO

from flask import current_app
from PIL import Image

from dagang.models import Sale

_METHOD_LABEL = {
    "cash": "Tunai",
    "transfer": "Transfer",
    "qris": "QRIS",
}

RECEIPT_EXPIRY_DAYS = 30


def receipt_is_expired(sale: Sale) -> bool:
    """Struk berlaku 30 hari sejak transaksi."""
    if sale.created_at is None:
        return False
    expires_at = sale.created_at + timedelta(days=RECEIPT_EXPIRY_DAYS)
    return datetime.now(timezone.utc) > expires_at


def _money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"))


def _print_logo_src() -> str:
    """Logo kecil (128px) via data URI supaya PDF struk tetap ringan (<300KB)."""
    image = Image.open("/app/static/icon-192.png").convert("RGB")
    image = image.resize((128, 128), Image.LANCZOS)
    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=85, optimize=True)
    encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/jpeg;base64,{encoded}"


def rupiah(value) -> str:
    """Format 'Rp 15.000' (tanpa desimal bila bulat).

    Memakai non-breaking space setelah "Rp" agar konsisten dengan format
    `Intl.NumberFormat("id-ID")` di frontend dan tidak terpotong saat print.
    """
    amount = _money(value)
    whole, _, frac = f"{amount:.2f}".partition(".")
    text = f"{int(whole):,}".replace(",", ".")
    if frac.strip("0"):
        text = f"{text},{frac}"
    return f"Rp\u00a0{text}"


def without_rp(text: str) -> str:
    """Hilangkan awalan "Rp" untuk kolom angka di struk thermal."""
    return text.replace("Rp\u00a0", "")


def store_info() -> dict:
    return {
        "name": current_app.config.get("STORE_NAME", "Warung DPR"),
        "address": current_app.config.get("STORE_ADDRESS", ""),
        "phone": current_app.config.get("STORE_PHONE", ""),
        "footer": current_app.config.get("STORE_FOOTER", "Terima kasih telah berbelanja!"),
    }


def format_datetime(value: datetime | None) -> str:
    if not value:
        return "-"
    return value.strftime("%d/%m/%Y %H:%M")


def method_label(method: str | None) -> str:
    return _METHOD_LABEL.get(method or "", method or "-")


def receipt_rows(sale: Sale) -> list[dict]:
    return [
        {
            "name": item.product_name,
            "qty": item.qty,
            "price": rupiah(item.unit_price),
            "subtotal": rupiah(item.subtotal),
        }
        for item in sale.items
    ]


def render_public_receipt_page(sale, for_pdf=False):
    store = store_info()
    rows = receipt_rows(sale)
    payment = sale.payments[0] if sale.payments else None

    item_rows = "".join(
        "<tr>"
        f'<td colspan="2" class="item-name">{escape(row["name"])}</td>'
        "</tr>"
        "<tr>"
        f'<td class="left">{row["qty"]} x {without_rp(row["price"])}</td>'
        f'<td class="right">{without_rp(row["subtotal"])}</td>'
        "</tr>"
        for row in rows
    )

    void_block = ""
    if sale.is_void:
        void_block = (
            '<div class="void">TRANSAKSI DIBATALKAN'
            f'<br />{escape(sale.void_reason or "")}</div>'
        )

    payment_block = ""
    if payment is not None:
        payment_block += (
            f'<tr><td class="left">{escape(method_label(payment.method))}</td>'
            f'<td class="right">{without_rp(rupiah(payment.amount))}</td></tr>'
        )
        if _money(payment.change_amount) > 0:
            payment_block += (
                '<tr><td class="left">Kembali</td>'
                f'<td class="right">{without_rp(rupiah(payment.change_amount))}</td></tr>'
            )

    address = f'<div class="center small">{escape(store["address"])}</div>' if store["address"] else ""
    phone = f'<div class="center small">{escape(store["phone"])}</div>' if store["phone"] else ""

    filename = f"struk-{escape(sale.invoice_no)}.pdf"

    logo_src = _print_logo_src() if for_pdf else "/icon-192.png"

    pdf_actions = "" if for_pdf else (
        '<div class="actions">\n'
        '      <a class="btn" href="/r/' + escape(sale.receipt_token) + '/pdf.pdf" download="' + filename + '">Simpan PDF</a>\n'
        '    </div>'
    )

    hide_print = '' if for_pdf else '@media print { .actions { display: none; } }'

    if for_pdf:
        html_body_width = "width: 80mm;"
        html_body_bg = "#fff"
        body_extra = ""
        wrap_styles = "width: 80mm; display: block; margin: 0 auto; padding: 0; text-align: center;"
        receipt_styles = "width: 80mm; background: #fff; margin: 0 auto; padding: 0; text-align: left;"
    else:
        html_body_width = "width: 100%;"
        html_body_bg = "#f1f5f9"
        body_extra = "display: flex; flex-direction: column; align-items: center; min-height: 100vh;"
        wrap_styles = "width: 100%; max-width: 100%; display: flex; flex-direction: column; align-items: center; padding: 16px 0 24px 0;"
        receipt_styles = "width: 80mm; max-width: 100%; background: #fff; margin: 0 auto; padding: 4mm 0; text-align: left; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-radius: 0;"

    parts = []
    parts.append('<!doctype html>')
    parts.append('<html lang="id"><head>')
    parts.append('<meta charset="utf-8" />')
    parts.append('<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />')
    parts.append('<title>Struk ' + escape(sale.invoice_no) + '</title>')
    parts.append('<style>')
    parts.append('  * { box-sizing: border-box; }')
    # Tinggi halaman dinamis agar semua item muat di satu halaman (tanpa potong),
    # lebar tetap 80mm agar canvas print pas (tidak lebar).
    page_height = max(120, 100 + len(getattr(sale, "items", []) or []) * 12)
    parts.append('  @page { size: 80mm ' + str(page_height) + 'mm; margin: 0; }')
    parts.append('  html, body {')
    parts.append('    margin: 0;')
    parts.append('    padding: 0;')
    parts.append('    ' + html_body_width)
    parts.append('    background: ' + html_body_bg + ';')
    parts.append('    font-family: "DejaVu Sans Mono", "Courier New", monospace;')
    parts.append('    color: #000;')
    parts.append('    line-height: 1.2;')
    parts.append('    font-size: 8.5pt;')
    parts.append('  }')
    parts.append('  body {')
    parts.append('    ' + body_extra)
    parts.append('  }')
    parts.append('  .wrap {')
    parts.append('    ' + wrap_styles)
    parts.append('  }')
    parts.append('  .receipt {')
    parts.append('    ' + receipt_styles)
    parts.append('  }')
    parts.append('  .center { text-align: center; }')
    parts.append('  .logo { display: block; margin: 0 auto 2mm auto; width: 30mm; height: 30mm; border-radius: 50%; object-fit: cover; }')
    parts.append('  .store { font-weight: bold; font-size: 9.5pt; text-transform: uppercase; }')
    parts.append('  .small { font-size: 7.5pt; }')
    parts.append('  .sep { text-align: center; letter-spacing: -0.5px; margin: 2mm 0; font-size: 7.5pt; }')
    parts.append('  table { width: 100%; border-collapse: collapse; table-layout: fixed; }')
    parts.append('  td { padding: 0 2mm; vertical-align: top; }')
    parts.append('  .label { width: 14mm; }')
    parts.append('  .colon { width: 2mm; }')
    parts.append('  .val { width: auto; }')
    parts.append('  .item-name { word-break: break-word; padding-top: 1mm; padding-left: 2mm; padding-right: 2mm; }')
    parts.append('  .left { text-align: left; padding-left: 2mm; }')
    parts.append('  .right { text-align: right; white-space: nowrap; width: 22mm; padding-right: 2mm; }')
    parts.append('  .total td { font-weight: bold; font-size: 9.5pt; padding-top: 1mm; }')
    parts.append('  .void {')
    parts.append('    text-align: center;')
    parts.append('    font-weight: bold;')
    parts.append('    border: 1px solid #000;')
    parts.append('    padding: 2mm 2mm;')
    parts.append('    margin: 2mm 2mm;')
    parts.append('  }')
    parts.append('  .footer { text-align: center; margin-top: 2mm; font-size: 8pt; padding: 0 2mm; }')
    parts.append('  .actions { width: 80mm; margin: 10px auto 0 auto; max-width: 100%; }')
    parts.append('  .btn {')
    parts.append('    display: block; text-align: center; padding: 10px;')
    parts.append('    background: #059669; color: #fff; border-radius: 8px; text-decoration: none;')
    parts.append('    font-weight: 600; font-size: 13px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;')
    parts.append('  }')
    parts.append('  ' + hide_print)
    parts.append('</style></head>')
    parts.append('<body>')
    parts.append('  <div class="wrap">')
    parts.append('    <div class="receipt">')
    parts.append('      <img class="logo" src="' + logo_src + '" alt="Logo" />')
    parts.append('      <div class="center store">WARUNG DPR</div>')
    parts.append('      ' + address)
    parts.append('      ' + phone)
    parts.append('      <div class="sep">------------------------------------------</div>')
    parts.append('      <table>')
    parts.append('        <tr><td class="label">No</td><td class="colon">:</td><td class="val">' + escape(sale.invoice_no) + '</td></tr>')
    parts.append('        <tr><td class="label">Tgl</td><td class="colon">:</td><td class="val">' + format_datetime(sale.created_at) + '</td></tr>')
    parts.append('        <tr><td class="label">Kasir</td><td class="colon">:</td><td class="val">' + escape(sale.cashier.display_name if sale.cashier else "-") + '</td></tr>')
    parts.append('      </table>')
    parts.append('      <div class="sep">------------------------------------------</div>')
    parts.append('      <table>')
    parts.append('        ' + item_rows)
    parts.append('      </table>')
    parts.append('      <div class="sep">------------------------------------------</div>')
    parts.append('      <table>')
    parts.append('        <tr><td class="left">Subtotal</td><td class="right">' + without_rp(rupiah(sale.subtotal)) + '</td></tr>')
    if _money(sale.discount) > 0:
        parts.append('        <tr><td class="left">Diskon</td><td class="right">-' + without_rp(rupiah(sale.discount)) + '</td></tr>')
    parts.append('        <tr class="total"><td class="left">TOTAL</td><td class="right">Rp ' + without_rp(rupiah(sale.total)) + '</td></tr>')
    parts.append('        ' + payment_block)
    parts.append('      </table>')
    parts.append('      ' + void_block)
    parts.append('      <div class="sep">------------------------------------------</div>')
    parts.append('      <div class="footer">' + escape(store["footer"]) + '</div>')
    parts.append('      <div class="footer">Barang yang sudah dibeli tidak dapat ditukar/dikembalikan.</div>')
    parts.append('    </div>')
    parts.append('    ' + pdf_actions)
    parts.append('  </div>')
    parts.append('</body></html>')

    return "\n".join(parts)



def build_receipt_pdf(sale: Sale) -> bytes:
    """PDF struk 80mm (dikembalikan sebagai bytes).

    Menggunakan template HTML yang sama dengan tampilan layar
    (render_public_receipt_page with for_pdf=True) sehingga layout
    PDF identik dengan yang terlihat di layar.
    """
    from weasyprint import HTML

    html = render_public_receipt_page(sale, for_pdf=True)
    return HTML(string=html, base_url="file:///app/static/").write_pdf()


def render_expired_receipt_page() -> str:
    """Halaman HTML untuk struk yang sudah expired (lebih dari 30 hari)."""
    return """<!doctype html>
<html lang="id"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<title>Struk Tidak Tersedia</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #f1f5f9;
    color: #0f172a;
    margin: 0;
    padding: 40px 20px;
    text-align: center;
  }
  .card {
    background: #fff;
    border-radius: 16px;
    padding: 40px 24px;
    max-width: 400px;
    margin: 0 auto;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }
  .icon { font-size: 48px; margin-bottom: 16px; }
  h1 { font-size: 20px; margin-bottom: 8px; }
  p { color: #64748b; font-size: 14px; line-height: 1.5; }
</style></head>
<body>
  <div class="card">
    <div class="icon">⏰</div>
    <h1>Struk sudah tidak tersedia</h1>
    <p>Struk ini sudah melewati masa berlaku 30 hari dan tidak dapat ditampilkan lagi.</p>
  </div>
</body></html>"""
