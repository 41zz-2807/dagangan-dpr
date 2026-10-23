"""Blueprint API: struk publik (bisa dibuka tanpa login, untuk dibagikan)."""

from __future__ import annotations

from io import BytesIO

from flask import Blueprint, Response, jsonify, send_file

from dagang.extensions import db
from dagang.models import Sale
from dagang.services.receipt import (
    build_receipt_pdf,
    receipt_is_expired,
    render_public_receipt_page,
)
from dagang.utils.errors import ApiError

bp = Blueprint("receipt", __name__, url_prefix="/r")


def _find_sale(token: str) -> Sale:
    sale = (
        db.session.query(Sale)
        .filter(Sale.receipt_token == token.strip())
        .one_or_none()
    )
    if sale is None:
        raise ApiError(404, "not_found", "Struk tidak ditemukan.")
    if receipt_is_expired(sale):
        raise ApiError(410, "receipt_expired", "Struk sudah tidak tersedia.")
    return sale


@bp.get("/<token>")
def public_receipt(token: str):
    """Halaman struk publik (HTML) untuk link ke pelanggan."""
    from dagang.services.receipt import render_expired_receipt_page
    try:
        sale = _find_sale(token)
    except ApiError as exc:
        if exc.code == "receipt_expired":
            response = Response(render_expired_receipt_page(), mimetype="text/html")
            response.headers["Cache-Control"] = "no-store"
            return response, 410
        raise
    response = Response(render_public_receipt_page(sale), mimetype="text/html")
    response.headers["Cache-Control"] = "no-store"
    return response


@bp.get("/<token>/pdf")
@bp.get("/<token>/pdf.pdf")
@bp.get("/<token>/struk.pdf")
def public_receipt_pdf(token: str):
    """Struk publik dalam bentuk PDF 80mm."""
    sale = _find_sale(token)
    pdf = build_receipt_pdf(sale)
    response = send_file(
        BytesIO(pdf),
        mimetype="application/pdf",
        as_attachment=True,
        download_name=f"struk-{sale.invoice_no}.pdf",
    )
    response.headers["Content-Disposition"] = f'attachment; filename="struk-{sale.invoice_no}.pdf"'
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@bp.get("/<token>/json")
def public_receipt_json(token: str):
    """Data struk dalam JSON (dipakai frontend untuk preview)."""
    sale = _find_sale(token)
    return jsonify({"sale": sale.to_dict(detail=True)})
