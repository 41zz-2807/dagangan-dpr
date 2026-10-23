"""Blueprint API: master produk (baca semua role, tulis owner)."""

from __future__ import annotations

from decimal import Decimal

from flask import Blueprint, jsonify, request
from sqlalchemy import func, or_

from dagang.extensions import db
from dagang.models import Category, Product, StockMovement, StockOpnameItem, User
from dagang.schemas import ProductCreateRequest, ProductUpdateRequest
from dagang.services.audit import record
from dagang.services.image import delete_image, save_product_image
from dagang.services.stock import set_initial_stock
from dagang.utils.decorators import load_current_user, roles_required
from dagang.utils.errors import ApiError
from dagang.utils.validators import parse_body

bp = Blueprint("products", __name__, url_prefix="/api/products")


def _image_urls(product: Product) -> dict:
    if not product.image_path:
        return {"image_url": None, "thumb_url": None}
    thumb = product.image_path.replace(".jpg", "_thumb.jpg")
    return {
        "image_url": f"/api/uploads/{product.image_path}",
        "thumb_url": f"/api/uploads/{thumb}",
    }


def _serialize(product: Product) -> dict:
    data = product.to_dict()
    data.update(_image_urls(product))
    return data


@bp.get("")
@roles_required(User.ROLE_OWNER, User.ROLE_KASIR)
def list_products():
    user = load_current_user()
    query = db.session.query(Product)

    search = (request.args.get("q") or "").strip()
    if search:
        pattern = f"%{search.lower()}%"
        query = query.filter(
            or_(
                func.lower(Product.name).like(pattern),
                func.lower(Product.sku).like(pattern),
                func.lower(func.coalesce(Product.barcode, "")).like(pattern),
            )
        )

    category_id = request.args.get("category_id")
    if category_id:
        try:
            query = query.filter(Product.category_id == int(category_id))
        except ValueError:
            raise ApiError(400, "invalid_filter", "category_id harus angka.")

    if user.role != User.ROLE_OWNER:
        query = query.filter(Product.is_active.is_(True))
    else:
        active = request.args.get("is_active")
        if active in {"true", "1"}:
            query = query.filter(Product.is_active.is_(True))
        elif active in {"false", "0"}:
            query = query.filter(Product.is_active.is_(False))

    if request.args.get("low_stock") in {"1", "true"}:
        query = query.filter(Product.stock <= Product.min_stock)

    try:
        page = max(1, int(request.args.get("page", 1)))
        per_page = min(200, max(1, int(request.args.get("per_page", 50))))
    except ValueError:
        raise ApiError(400, "invalid_pagination", "page/per_page harus angka.")

    total = query.count()
    products = (
        query.order_by(Product.name)
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    return jsonify(
        {
            "items": [_serialize(product) for product in products],
            "total": total,
            "page": page,
            "per_page": per_page,
            "pages": (total + per_page - 1) // per_page,
        }
    )


@bp.get("/barcode/<barcode>")
@roles_required(User.ROLE_OWNER, User.ROLE_KASIR)
def get_by_barcode(barcode: str):
    product = (
        db.session.query(Product)
        .filter(Product.barcode == barcode.strip(), Product.is_active.is_(True))
        .one_or_none()
    )
    if product is None:
        raise ApiError(404, "not_found", "Produk dengan barcode tersebut tidak ditemukan.")
    return jsonify({"product": _serialize(product)})


@bp.get("/<int:product_id>")
@roles_required(User.ROLE_OWNER, User.ROLE_KASIR)
def get_product(product_id: int):
    product = db.session.get(Product, product_id)
    if product is None:
        raise ApiError(404, "not_found", "Produk tidak ditemukan.")
    return jsonify({"product": _serialize(product)})


@bp.post("")
@roles_required(User.ROLE_OWNER)
def create_product():
    data = parse_body(ProductCreateRequest)
    owner = load_current_user()

    sku = data.sku
    if not sku:
        prefix = "PRD"
        if data.category_id:
            category = db.session.get(Category, data.category_id)
            if category and category.name:
                prefix = "".join(
                    c for c in category.name.strip().upper() if c.isalnum()
                )[:3] or "PRD"
        sku = _next_available_sku(prefix)
        if sku is None:
            raise ApiError(409, "sku_exists", "Tidak dapat menghasilkan SKU unik.")

    barcode = data.barcode
    if not barcode:
        barcode = _next_available_barcode()
        if barcode is None:
            raise ApiError(
                409, "barcode_exists", "Tidak dapat menghasilkan barcode unik."
            )

    _ensure_unique(sku, barcode)
    _ensure_category(data.category_id)

    product = Product(
        sku=sku,
        barcode=barcode,
        name=data.name.strip(),
        description=data.description,
        category_id=data.category_id,
        price_sale=_money(data.price_sale),
        price_purchase=_money(data.price_purchase),
        stock=0,
        min_stock=data.min_stock,
        unit=data.unit,
        image_path=data.image_path,
        is_active=data.is_active,
    )
    db.session.add(product)
    db.session.flush()

    if data.stock:
        product.stock = int(data.stock)
        set_initial_stock(product=product, stock=int(data.stock), user=owner)

    db.session.commit()

    record(
        "product.create",
        user=owner,
        entity="products",
        entity_id=product.id,
        after=_serialize(product),
    )
    return jsonify({"product": _serialize(product)}), 201


@bp.patch("/<int:product_id>")
@roles_required(User.ROLE_OWNER)
def update_product(product_id: int):
    data = parse_body(ProductUpdateRequest)
    owner = load_current_user()

    product = db.session.get(Product, product_id)
    if product is None:
        raise ApiError(404, "not_found", "Produk tidak ditemukan.")

    before = _serialize(product)
    before_price = (product.price_sale, product.price_purchase)

    if data.sku is not None and data.sku != product.sku:
        _ensure_unique(data.sku, product.barcode, exclude_id=product.id)
        product.sku = data.sku
    if data.name is not None:
        product.name = data.name.strip()
    if data.barcode is not None:
        _ensure_unique(product.sku, data.barcode, exclude_id=product.id)
        product.barcode = data.barcode
    if data.description is not None:
        product.description = data.description
    if "category_id" in data.model_fields_set and data.category_id is not None:
        _ensure_category(data.category_id)
        product.category_id = data.category_id
    if data.price_sale is not None:
        product.price_sale = _money(data.price_sale)
    if data.price_purchase is not None:
        product.price_purchase = _money(data.price_purchase)
    if data.min_stock is not None:
        product.min_stock = data.min_stock
    if data.unit is not None:
        product.unit = data.unit.strip().lower()
    if data.is_active is not None:
        product.is_active = data.is_active
    if "image_path" in data.model_fields_set:
        if data.image_path != product.image_path:
            delete_image(product.image_path)
        product.image_path = data.image_path or None

    db.session.commit()
    after = _serialize(product)

    record(
        "product.update",
        user=owner,
        entity="products",
        entity_id=product.id,
        before=before,
        after=after,
    )

    if before_price != (product.price_sale, product.price_purchase):
        record(
            "product.price_change",
            user=owner,
            entity="products",
            entity_id=product.id,
            before={
                "price_sale": str(before_price[0]),
                "price_purchase": str(before_price[1]),
            },
            after={
                "price_sale": str(product.price_sale),
                "price_purchase": str(product.price_purchase),
            },
        )
    return jsonify({"product": after})


@bp.delete("/<int:product_id>")
@roles_required(User.ROLE_OWNER)
def delete_product(product_id: int):
    """Hapus produk permanen. Riwayat penjualan tetap tersimpan sebagai snapshot."""
    owner = load_current_user()
    product = db.session.get(Product, product_id)
    if product is None:
        raise ApiError(404, "not_found", "Produk tidak ditemukan.")

    opname_items = (
        db.session.query(func.count(StockOpnameItem.id))
        .filter(StockOpnameItem.product_id == product.id)
        .scalar()
        or 0
    )
    if opname_items:
        raise ApiError(
            409,
            "product_in_opname",
            "Produk tercatat pada stok opname sehingga tidak bisa dihapus permanen. Gunakan Nonaktifkan.",
        )

    before = _serialize(product)
    image_path = product.image_path

    db.session.query(StockMovement).filter(
        StockMovement.product_id == product.id
    ).delete(synchronize_session=False)
    db.session.delete(product)
    db.session.commit()

    if image_path:
        delete_image(image_path)

    record(
        "product.delete",
        user=owner,
        entity="products",
        entity_id=product_id,
        before=before,
    )
    return jsonify({"deleted": True, "id": product_id})


@bp.post("/<int:product_id>/image")
@roles_required(User.ROLE_OWNER)
def upload_product_image(product_id: int):
    owner = load_current_user()
    product = db.session.get(Product, product_id)
    if product is None:
        raise ApiError(404, "not_found", "Produk tidak ditemukan.")

    file_storage = request.files.get("file")
    result = save_product_image(file_storage)

    old_image = product.image_path
    product.image_path = result["image_path"]
    db.session.commit()

    if old_image and old_image != result["image_path"]:
        delete_image(old_image)

    record(
        "product.image_upload",
        user=owner,
        entity="products",
        entity_id=product.id,
        before={"image_path": old_image},
        after={
            "image_path": result["image_path"],
            "size_bytes": result["size_bytes"],
        },
    )
    return jsonify({"product": _serialize(product), "image": result}), 201


# --------------------------------------------------------------------------
def _money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"))


def _ensure_unique(sku: str, barcode: str | None, exclude_id: int | None = None) -> None:
    query = db.session.query(Product)
    if exclude_id is not None:
        query = query.filter(Product.id != exclude_id)

    if query.filter(func.lower(Product.sku) == sku.lower()).first() is not None:
        raise ApiError(409, "sku_exists", f"SKU '{sku}' sudah dipakai produk lain.")

    if barcode:
        if (
            query.filter(func.lower(Product.barcode) == barcode.lower()).first()
            is not None
        ):
            raise ApiError(409, "barcode_exists", f"Barcode '{barcode}' sudah dipakai.")


def _ensure_category(category_id: int | None) -> None:
    if category_id is None:
        return
    if db.session.get(Category, category_id) is None:
        raise ApiError(422, "invalid_category", "Kategori tidak ditemukan.")


def _next_available_sku(prefix: str) -> str | None:
    """Hasilkan SKU unik berupa PREFIX-0001, PREFIX-0002, dst."""
    for n in range(1, 10000):
        candidate = f"{prefix}-{n:04d}"
        exists = (
            db.session.query(Product)
            .filter(func.lower(Product.sku) == candidate.lower())
            .first()
        )
        if exists is None:
            return candidate
    return None


def _next_available_barcode() -> str | None:
    """Hasilkan barcode numerik 12 digit yang belum terpakai."""
    max_barcode = (
        db.session.query(func.max(Product.barcode)).scalar()
    )
    start = 1
    if max_barcode and str(max_barcode).isdigit():
        start = int(max_barcode) + 1
    for n in range(start, start + 10000):
        candidate = f"{n:012d}"
        exists = (
            db.session.query(Product)
            .filter(func.lower(Product.barcode) == candidate.lower())
            .first()
        )
        if exists is None:
            return candidate
    return None
