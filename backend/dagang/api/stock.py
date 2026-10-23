"""Blueprint API: stok (daftar pergerakan, adjust, stok menipis)."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

from flask import Blueprint, jsonify, request
from sqlalchemy import func

from dagang.extensions import db
from dagang.models import Product, StockMovement, User
from dagang.schemas import StockAdjustRequest
from dagang.services.audit import record
from dagang.services.stock import adjust_stock
from dagang.utils.decorators import load_current_user, roles_required
from dagang.utils.errors import ApiError
from dagang.utils.validators import parse_body

bp = Blueprint("stock", __name__, url_prefix="/api/stock")


@bp.get("/movements")
@roles_required(User.ROLE_OWNER, User.ROLE_KASIR)
def list_movements():
    query = db.session.query(StockMovement)

    product_id = request.args.get("product_id")
    if product_id:
        try:
            query = query.filter(StockMovement.product_id == int(product_id))
        except ValueError:
            raise ApiError(400, "invalid_filter", "product_id harus angka.")

    movement_type = (request.args.get("type") or "").strip().lower()
    if movement_type:
        query = query.filter(StockMovement.movement_type == movement_type)

    username = (request.args.get("username") or "").strip()
    if username:
        query = query.join(User, StockMovement.user_id == User.id).filter(
            func.lower(User.username) == username.lower()
        )

    date_from = _parse_date(request.args.get("from"))
    if date_from:
        query = query.filter(StockMovement.created_at >= date_from)
    date_to = _parse_date(request.args.get("to"))
    if date_to:
        query = query.filter(StockMovement.created_at < date_to + timedelta(days=1))

    try:
        page = max(1, int(request.args.get("page", 1)))
        per_page = min(200, max(1, int(request.args.get("per_page", 50))))
    except ValueError:
        raise ApiError(400, "invalid_pagination", "page/per_page harus angka.")

    total = query.count()
    movements = (
        query.order_by(StockMovement.created_at.desc(), StockMovement.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    return jsonify(
        {
            "items": [movement.to_dict() for movement in movements],
            "total": total,
            "page": page,
            "per_page": per_page,
            "pages": (total + per_page - 1) // per_page,
        }
    )


@bp.get("/low")
@roles_required(User.ROLE_OWNER, User.ROLE_KASIR)
def low_stock():
    products = (
        db.session.query(Product)
        .filter(Product.is_active.is_(True), Product.stock <= Product.min_stock)
        .order_by(Product.stock.asc())
        .all()
    )
    return jsonify({"items": [product.to_dict() for product in products]})


@bp.get("/summary")
@roles_required(User.ROLE_OWNER, User.ROLE_KASIR)
def summary():
    total_products = (
        db.session.query(func.count(Product.id))
        .filter(Product.is_active.is_(True))
        .scalar()
        or 0
    )
    total_units = (
        db.session.query(func.coalesce(func.sum(Product.stock), 0))
        .filter(Product.is_active.is_(True))
        .scalar()
        or 0
    )
    low_count = (
        db.session.query(func.count(Product.id))
        .filter(Product.is_active.is_(True), Product.stock <= Product.min_stock)
        .scalar()
        or 0
    )
    return jsonify(
        {
            "total_products": int(total_products),
            "total_units": int(total_units),
            "low_stock_count": int(low_count),
        }
    )


@bp.post("/adjust")
@roles_required(User.ROLE_OWNER, User.ROLE_KASIR)
def adjust():
    """Penyesuaian stok oleh owner maupun kasir (alasan wajib)."""
    data = parse_body(StockAdjustRequest)
    user = load_current_user()

    if data.mode == "delta" and data.qty == 0:
        raise ApiError(422, "invalid_qty", "Jumlah perubahan stok tidak boleh nol.")

    movement_type = (
        StockMovement.TYPE_RESTOCK if data.qty > 0 else StockMovement.TYPE_ADJUST
    )
    product, movement = adjust_stock(
        product_id=data.product_id,
        mode=data.mode,
        qty=data.qty,
        reason=data.reason,
        user=user,
        movement_type=movement_type,
    )
    return jsonify(
        {
            "product": product.to_dict(),
            "movement": movement.to_dict(),
            "message": "Stok diperbarui.",
        }
    )


def _parse_date(value: str | None):
    if not value:
        return None
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        raise ApiError(400, "invalid_filter", "Format tanggal harus YYYY-MM-DD.")
    return datetime.combine(parsed, time.min)
