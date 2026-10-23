"""Logika penjualan: total dihitung ulang di server, stok dikunci, simpan atomik."""

from __future__ import annotations

import secrets
from datetime import datetime
from decimal import Decimal

from sqlalchemy import text

from dagang.extensions import db
from dagang.models import (
    Payment,
    Product,
    Sale,
    SaleItem,
    Shift,
    ShiftTransaction,
    StockMovement,
    User,
)
from dagang.services.audit import record
from dagang.utils.errors import ApiError

ZERO = Decimal("0.00")


def _money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"))


def _next_invoice_no() -> str:
    """Nomor invoice unik: TRX-YYYYMMDD-00001.

    Angkanya diambil dari sequence PostgreSQL supaya tetap berurutan dan unik
    meski dua kasir menyimpan transaksi bersamaan.
    """
    seq = db.session.execute(text("SELECT nextval('sale_invoice_seq')")).scalar_one()
    now = datetime.now()  # waktu lokal container (Asia/Jakarta) = now() di sisi DB
    return f"TRX-{now:%Y%m%d}-{int(seq):05d}"


def _merge_items(raw_items) -> list[tuple[int, int]]:
    """Gabungkan baris dengan produk yang sama & urutkan id (urutan lock konsisten)."""
    merged: dict[int, int] = {}
    for item in raw_items:
        merged[item.product_id] = merged.get(item.product_id, 0) + item.qty
    return sorted(merged.items())


def _lock_products(product_ids: list[int]) -> dict[int, Product]:
    """Ambil produk dengan `SELECT ... FOR UPDATE` (mencegah stok minus saat concurrently)."""
    rows = (
        db.session.query(Product)
        .filter(Product.id.in_(product_ids), Product.is_active.is_(True))
        .order_by(Product.id)
        .with_for_update()
        .all()
    )
    return {row.id: row for row in rows}


def _validate_payments(payments, total: Decimal) -> list[dict]:
    """Normalisasi pembayaran: pastikan total tertutup, kembalian hanya untuk cash."""
    if not payments:
        raise ApiError(422, "payment_required", "Minimal satu metode pembayaran diperlukan.")

    prepared: list[dict] = []
    cash_count = 0
    for payment in payments:
        method = payment.method
        if method == Payment.METHOD_CASH:
            cash_count += 1
        amount = _money(payment.amount) if payment.amount is not None else None
        if amount is None:
            if method == Payment.METHOD_CASH:
                raise ApiError(
                    422,
                    "payment_amount_required",
                    "Jumlah uang diterima wajib diisi untuk pembayaran tunai.",
                )
            amount = total
        if amount < ZERO:
            raise ApiError(422, "invalid_amount", "Jumlah pembayaran tidak valid.")
        prepared.append(
            {
                "method": method,
                "amount": amount,
                "reference": (payment.reference or None),
            }
        )

    if cash_count > 1:
        raise ApiError(
            422,
            "invalid_payment",
            "Hanya boleh satu pembayaran tunai dalam satu transaksi.",
        )

    paid = sum((item["amount"] for item in prepared), ZERO)
    if paid < total:
        raise ApiError(
            422,
            "payment_insufficient",
            "Jumlah pembayaran lebih kecil dari total transaksi.",
            {"total": str(total), "paid": str(paid)},
        )

    # Kelebihan bayar hanya boleh terjadi pada pembayaran tunai (dikembalikan).
    if paid > total:
        cash_items = [item for item in prepared if item["method"] == Payment.METHOD_CASH]
        if not cash_items:
            raise ApiError(
                422,
                "payment_excess",
                "Pembayaran non-tunai harus sama dengan total transaksi.",
                {"total": str(total), "paid": str(paid)},
            )
        cash_items[0]["change_amount"] = paid - total
    for item in prepared:
        item.setdefault("change_amount", ZERO)
    return prepared


def create_sale(
    *,
    items,
    payments,
    discount=None,
    customer_name: str | None = None,
    customer_phone: str | None = None,
    note: str | None = None,
    user: User,
) -> Sale:
    """Buat transaksi penjualan dalam satu transaksi database.

    - Harga, subtotal, diskon, total, dan kembalian dihitung ulang di server.
    - Stok produk dikunci (`FOR UPDATE`) dan tidak boleh menjadi minus.
    - Setiap penjualan membuat baris `stock_movements` bertipe `sale`.
    """
    merged = _merge_items(items)
    if not merged:
        raise ApiError(422, "empty_cart", "Keranjang masih kosong.")

    products = _lock_products([product_id for product_id, _ in merged])

    missing: list[int] = []
    inactive: list[str] = []
    insufficient: list[dict] = []
    subtotal = ZERO
    for product_id, qty in merged:
        product = products.get(product_id)
        if product is None:
            missing.append(product_id)
            continue
        if not product.is_active:
            inactive.append(product.name)
            continue
        if product.stock < qty:
            insufficient.append(
                {
                    "product_id": product_id,
                    "product_name": product.name,
                    "requested": qty,
                    "available": product.stock,
                }
            )
            continue
        subtotal += _money(product.price_sale) * qty

    if missing:
        raise ApiError(
            404,
            "product_not_found",
            "Sebagian produk tidak ditemukan.",
            {"product_ids": missing},
        )
    if inactive:
        raise ApiError(
            409,
            "product_inactive",
            "Sebagian produk sudah nonaktif.",
            {"products": inactive},
        )
    if insufficient:
        raise ApiError(
            409,
            "insufficient_stock",
            "Stok tidak mencukupi untuk sebagian produk.",
            {"items": insufficient},
        )

    discount_amount = _money(discount)
    if discount_amount < ZERO:
        raise ApiError(422, "invalid_discount", "Diskon tidak valid.")
    if discount_amount > subtotal:
        raise ApiError(
            422,
            "invalid_discount",
            "Diskon lebih besar dari subtotal.",
            {"subtotal": str(subtotal)},
        )
    if discount_amount > ZERO and user.role != User.ROLE_OWNER:
        raise ApiError(
            403,
            "forbidden",
            "Hanya owner yang dapat memberi diskon.",
        )

    total = subtotal - discount_amount
    if total < ZERO:
        total = ZERO

    prepared_payments = _validate_payments(payments, total)

    invoice_no = _next_invoice_no()
    receipt_token = secrets.token_hex(16)

    sale = Sale(
        invoice_no=invoice_no,
        cashier_id=user.id,
        subtotal=subtotal,
        discount=discount_amount,
        total=total,
        status=Sale.STATUS_PAID,
        customer_name=customer_name or None,
        customer_phone=customer_phone or None,
        receipt_token=receipt_token,
        note=note or None,
    )
    db.session.add(sale)
    db.session.flush()

    for product_id, qty in merged:
        product = products[product_id]
        unit_price = _money(product.price_sale)
        db.session.add(
            SaleItem(
                sale_id=sale.id,
                product_id=product.id,
                qty=qty,
                product_name=product.name,
                product_sku=product.sku,
                unit_price=unit_price,
                subtotal=unit_price * qty,
            )
        )
        product.stock -= qty
        db.session.add(
            StockMovement(
                product_id=product.id,
                qty=-qty,
                movement_type=StockMovement.TYPE_SALE,
                reason=f"Penjualan {invoice_no}",
                user_id=user.id,
                sale_id=sale.id,
                ref=invoice_no,
            )
        )

    for payment in prepared_payments:
        db.session.add(
            Payment(
                sale_id=sale.id,
                method=payment["method"],
                amount=payment["amount"],
                reference=payment["reference"],
                change_amount=payment["change_amount"],
            )
        )

    # Tautkan transaksi ke shift kasir yang sedang terbuka (jika ada).
    # Shift tetap boleh ditutup walau transaksi ini tidak tertaut; ringkasan
    # uang laci dihitung dari rentang waktu shift.
    open_shift = (
        db.session.query(Shift)
        .filter_by(cashier_id=user.id, status="open")
        .first()
    )
    if open_shift is not None:
        db.session.add(ShiftTransaction(shift_id=open_shift.id, sale_id=sale.id))

    record(
        "sale.create",
        user=user,
        entity="sales",
        entity_id=sale.id,
        after={
            "invoice_no": invoice_no,
            "subtotal": str(subtotal),
            "discount": str(discount_amount),
            "total": str(total),
            "items": [
                {"product_id": pid, "qty": qty} for pid, qty in merged
            ],
            "payments": [
                {
                    "method": p["method"],
                    "amount": str(p["amount"]),
                    "change_amount": str(p["change_amount"]),
                }
                for p in prepared_payments
            ],
        },
        commit=False,
    )

    db.session.commit()
    return sale


def void_sale(*, sale_id: int, reason: str, user: User) -> Sale:
    """Batalkan transaksi (owner): status jadi void + stok dikembalikan.

    Data transaksi tidak dihapus; stok dikembalikan dan dicatat sebagai
    pergerakan bertipe `void` supaya jejak audit tetap utuh.
    """
    reason = (reason or "").strip()
    if len(reason) < 3:
        raise ApiError(422, "reason_required", "Alasan pembatalan wajib diisi.")

    sale = (
        db.session.query(Sale)
        .filter(Sale.id == sale_id)
        .with_for_update()
        .one_or_none()
    )
    if sale is None:
        raise ApiError(404, "not_found", "Transaksi tidak ditemukan.")
    if sale.status == Sale.STATUS_VOID:
        raise ApiError(409, "already_void", "Transaksi ini sudah dibatalkan.")

    before = sale.to_dict()
    items = list(sale.items)
    product_ids = [item.product_id for item in items if item.product_id]
    products = _lock_products(product_ids) if product_ids else {}

    for item in items:
        if not item.product_id:
            continue
        product = products.get(item.product_id)
        if product is None:
            raise ApiError(
                409,
                "product_missing",
                "Produk pada transaksi ini sudah tidak ada, pembatalan dibatalkan.",
            )
        product.stock += item.qty
        db.session.add(
            StockMovement(
                product_id=product.id,
                qty=item.qty,
                movement_type=StockMovement.TYPE_VOID,
                reason=f"Void {sale.invoice_no}: {reason}",
                user_id=user.id,
                sale_id=sale.id,
                ref=sale.invoice_no,
            )
        )

    sale.status = Sale.STATUS_VOID
    sale.voided_at = datetime.now()
    sale.voided_by_id = user.id
    sale.void_reason = reason

    record(
        "sale.void",
        user=user,
        entity="sales",
        entity_id=sale.id,
        before={"status": before["status"], "total": before["total"]},
        after={"status": sale.status, "reason": reason},
        commit=False,
    )

    db.session.commit()
    return sale
