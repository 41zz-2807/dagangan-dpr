"""Blueprint API: kategori produk (baca semua role, tulis owner)."""

from __future__ import annotations

from flask import Blueprint, jsonify, request
from sqlalchemy import func, or_

from dagang.extensions import db
from dagang.models import Category, Product, User
from dagang.schemas import CategoryCreateRequest, CategoryUpdateRequest
from dagang.services.audit import record
from dagang.utils.decorators import load_current_user, roles_required
from dagang.utils.errors import ApiError
from dagang.utils.validators import parse_body

bp = Blueprint("categories", __name__, url_prefix="/api/categories")


@bp.get("")
@roles_required(User.ROLE_OWNER, User.ROLE_KASIR)
def list_categories():
    user = load_current_user()
    query = db.session.query(Category)

    if user.role != User.ROLE_OWNER:
        query = query.filter(Category.is_active.is_(True))
    else:
        active = request.args.get("is_active")
        if active in {"true", "1"}:
            query = query.filter(Category.is_active.is_(True))
        elif active in {"false", "0"}:
            query = query.filter(Category.is_active.is_(False))

    search = (request.args.get("q") or "").strip()
    if search:
        pattern = f"%{search.lower()}%"
        query = query.filter(func.lower(Category.name).like(pattern))

    categories = query.order_by(Category.name).all()
    items = []
    for category in categories:
        data = category.to_dict(with_counts=True)
        data["active_product_count"] = (
            db.session.query(func.count(Product.id))
            .filter(Product.category_id == category.id, Product.is_active.is_(True))
            .scalar()
            or 0
        )
        items.append(data)
    return jsonify({"items": items, "total": len(items)})


@bp.post("")
@roles_required(User.ROLE_OWNER)
def create_category():
    data = parse_body(CategoryCreateRequest)
    owner = load_current_user()

    exists = (
        db.session.query(Category)
        .filter(func.lower(Category.name) == data.name.lower())
        .one_or_none()
    )
    if exists is not None:
        raise ApiError(409, "name_exists", "Nama kategori sudah digunakan.")

    category = Category(
        name=data.name.strip(),
        description=data.description,
        is_active=True,
    )
    db.session.add(category)
    db.session.commit()

    record(
        "category.create",
        user=owner,
        entity="categories",
        entity_id=category.id,
        after={"name": category.name, "description": category.description},
    )
    return jsonify({"category": category.to_dict(with_counts=True)}), 201


@bp.patch("/<int:category_id>")
@roles_required(User.ROLE_OWNER)
def update_category(category_id: int):
    data = parse_body(CategoryUpdateRequest)
    owner = load_current_user()

    category = db.session.get(Category, category_id)
    if category is None:
        raise ApiError(404, "not_found", "Kategori tidak ditemukan.")

    before = category.to_dict(with_counts=True)

    if data.name is not None and data.name.lower() != category.name.lower():
        exists = (
            db.session.query(Category)
            .filter(func.lower(Category.name) == data.name.lower(), Category.id != category.id)
            .one_or_none()
        )
        if exists is not None:
            raise ApiError(409, "name_exists", "Nama kategori sudah digunakan.")
        category.name = data.name.strip()
    if data.description is not None:
        category.description = data.description
    if data.is_active is not None:
        category.is_active = data.is_active

    db.session.commit()

    record(
        "category.update",
        user=owner,
        entity="categories",
        entity_id=category.id,
        before=before,
        after=category.to_dict(with_counts=True),
    )
    return jsonify({"category": category.to_dict(with_counts=True)})


@bp.delete("/<int:category_id>")
@roles_required(User.ROLE_OWNER)
def delete_category(category_id: int):
    owner = load_current_user()
    category = db.session.get(Category, category_id)
    if category is None:
        raise ApiError(404, "not_found", "Kategori tidak ditemukan.")

    product_count = (
        db.session.query(func.count(Product.id))
        .filter(Product.category_id == category.id)
        .scalar()
        or 0
    )
    if product_count:
        raise ApiError(
            409,
            "category_used",
            f"Kategori masih dipakai oleh {product_count} produk. "
            "Pindahkan atau hapus produk tersebut terlebih dahulu.",
        )

    before = category.to_dict(with_counts=True)
    db.session.delete(category)
    db.session.commit()

    record(
        "category.delete",
        user=owner,
        entity="categories",
        entity_id=category_id,
        before=before,
    )
    return jsonify({"deleted": True, "id": category_id})
