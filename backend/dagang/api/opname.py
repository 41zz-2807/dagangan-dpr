"""Blueprint API: Stok Opname."""

from __future__ import annotations

from datetime import datetime, time, timedelta

from flask import Blueprint, jsonify, request
from sqlalchemy import func

from dagang.extensions import db
from dagang.models import Product, StockMovement, StockOpname, StockOpnameItem, User
from dagang.utils.decorators import load_current_user, roles_required
from dagang.utils.errors import ApiError

bp = Blueprint("opname", __name__, url_prefix="/api/opname")


@bp.get("")
@roles_required(User.ROLE_OWNER)
def list_opname():
    items = db.session.query(StockOpname).order_by(StockOpname.created_at.desc()).limit(100).all()
    return jsonify({"items": [o.to_dict() for o in items]})


@bp.post("")
@roles_required(User.ROLE_OWNER)
def create_opname():
    user = load_current_user()
    data = request.get_json(silent=True) or {}
    notes = (data.get("notes") or "").strip() or None
    
    # Generate opname number
    today = datetime.now().strftime("%Y%m%d")
    count = db.session.query(func.count(StockOpname.id)).filter(StockOpname.opname_no.like(f"OP-{today}-%")).scalar() or 0
    opname_no = f"OP-{today}-{count+1:04d}"
    
    opname = StockOpname(opname_no=opname_no, user_id=user.id, notes=notes, status="draft")
    db.session.add(opname)
    db.session.flush()
    
    # Add all active products
    products = db.session.query(Product).filter(Product.is_active.is_(True)).order_by(Product.name).all()
    for p in products:
        item = StockOpnameItem(
            opname_id=opname.id,
            product_id=p.id,
            system_stock=p.stock,
            physical_stock=p.stock,
            difference=0,
        )
        db.session.add(item)
    
    db.session.commit()
    return jsonify({"opname": opname.to_dict(include_items=True)}), 201


@bp.get("/<int:opname_id>")
@roles_required(User.ROLE_OWNER)
def get_opname(opname_id: int):
    opname = db.session.query(StockOpname).filter_by(id=opname_id).first()
    if not opname:
        raise ApiError(404, "not_found", "Stok opname tidak ditemukan.")
    return jsonify({"opname": opname.to_dict(include_items=True)})


@bp.put("/<int:opname_id>/items")
@roles_required(User.ROLE_OWNER)
def update_items(opname_id: int):
    opname = db.session.query(StockOpname).filter_by(id=opname_id).first()
    if not opname:
        raise ApiError(404, "not_found", "Stok opname tidak ditemukan.")
    if opname.status != "draft":
        raise ApiError(409, "not_draft", "Hanya opname draft yang bisa diubah.")
    
    data = request.get_json(silent=True) or {}
    items_data = data.get("items") or []
    
    for it in items_data:
        item_id = it.get("id")
        physical = it.get("physical_stock")
        if item_id is None or physical is None:
            continue
        item = db.session.query(StockOpnameItem).filter_by(id=item_id, opname_id=opname_id).first()
        if not item:
            continue
        try:
            physical_int = int(physical)
        except (TypeError, ValueError):
            continue
        if physical_int < 0:
            raise ApiError(422, "invalid_stock", "Stok fisik tidak boleh negatif.")
        item.physical_stock = physical_int
        item.difference = physical_int - item.system_stock
    
    db.session.commit()
    return jsonify({"opname": opname.to_dict(include_items=True)})


@bp.post("/<int:opname_id>/complete")
@roles_required(User.ROLE_OWNER)
def complete_opname(opname_id: int):
    user = load_current_user()
    opname = db.session.query(StockOpname).filter_by(id=opname_id).with_for_update().first()
    if not opname:
        raise ApiError(404, "not_found", "Stok opname tidak ditemukan.")
    if opname.status != "draft":
        raise ApiError(409, "not_draft", "Opname sudah selesai atau dibatalkan.")
    
    items = db.session.query(StockOpnameItem).filter_by(opname_id=opname_id).all()
    
    for item in items:
        # Item yang tidak diubah operator masih berisi snapshot stok saat
        # opname dibuat. Jangan di-adjust, supaya penjualan yang terjadi
        # setelah opname dibuat tidak ikut dibatalkan.
        if item.difference == 0:
            continue

        product = (
            db.session.query(Product)
            .filter_by(id=item.product_id)
            .with_for_update()
            .first()
        )
        if product is None:
            continue

        # Stok sistem bisa berubah sejak opname dibuat (mis. ada penjualan).
        # Karena itu selisih dihitung ulang dari stok terkini saat selesai,
        # bukan dari snapshot `system_stock`/`difference` yang sudah basi.
        delta = int(item.physical_stock) - int(product.stock)
        item.system_stock = product.stock
        item.difference = delta

        if delta != 0:
            product.stock = item.physical_stock
            db.session.add(StockMovement(
                product_id=product.id,
                qty=delta,
                movement_type=StockMovement.TYPE_ADJUST,
                reason=f"Stok Opname {opname.opname_no}",
                user_id=user.id,
                ref=opname.opname_no,
            ))
        item.adjusted = True
    
    opname.status = "completed"
    opname.completed_at = datetime.now()
    db.session.commit()
    return jsonify({"opname": opname.to_dict(include_items=True)})
