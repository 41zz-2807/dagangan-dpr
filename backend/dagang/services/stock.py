"""Logika stok: penyesuaian stok atomik + pencatatan pergerakan."""

from __future__ import annotations

from decimal import Decimal

from dagang.extensions import db
from dagang.models import Product, StockMovement, User
from dagang.services.audit import record
from dagang.utils.errors import ApiError


def adjust_stock(
    *,
    product_id: int,
    mode: str,
    qty: int,
    reason: str,
    user: User,
    movement_type: str = StockMovement.TYPE_ADJUST,
) -> tuple[Product, StockMovement]:
    """Ubah stok produk secara atomik.

    mode "delta": stok += qty (qty boleh negatif)
    mode "set"   : stok = qty (nilai absolut)

    Stok tidak boleh menjadi negatif. Semua perubahan tercatat pada tabel
    `stock_movements` (delta bertanda) dan audit log.
    """
    reason = (reason or "").strip()
    if len(reason) < 3:
        raise ApiError(422, "reason_required", "Alasan perubahan stok wajib diisi.")

    product = (
        db.session.query(Product)
        .filter(Product.id == product_id)
        .with_for_update()
        .one_or_none()
    )
    if product is None:
        raise ApiError(404, "not_found", "Produk tidak ditemukan.")

    before_stock = product.stock
    if mode == "set":
        new_stock = int(qty)
    else:
        new_stock = before_stock + int(qty)

    if new_stock < 0:
        raise ApiError(
            409,
            "insufficient_stock",
            f"Stok {product.name} tidak mencukupi (stok saat ini {before_stock}).",
        )

    delta = new_stock - before_stock
    product.stock = new_stock
    db.session.flush()

    movement = StockMovement(
        product_id=product.id,
        qty=delta,
        movement_type=movement_type,
        reason=reason,
        user_id=user.id,
        ref=None,
    )
    db.session.add(movement)
    db.session.commit()

    record(
        "stock.adjust",
        user=user,
        entity="products",
        entity_id=product.id,
        before={"stock": before_stock},
        after={"stock": new_stock, "delta": delta, "reason": reason},
    )
    return product, movement


def set_initial_stock(
    *,
    product: Product,
    stock: int,
    user: User,
) -> StockMovement:
    """Set stok awal saat produk dibuat (per Movements: tipe 'restock')."""
    if stock <= 0:
        return None  # type: ignore[return-value]
    movement = StockMovement(
        product_id=product.id,
        qty=int(stock),
        movement_type=StockMovement.TYPE_RESTOCK,
        reason="Stok awal saat produk dibuat",
        user_id=user.id,
    )
    db.session.add(movement)
    return movement


def apply_stock_delta(product: Product, delta: int) -> None:
    """Kurangi/tambah stok (dipakai saat penjualan/void, sudah dijaga row lock)."""
    new_stock = product.stock + int(delta)
    if new_stock < 0:
        raise ApiError(409, "insufficient_stock", "Stok tidak mencukupi.")
    product.stock = new_stock


def to_decimal(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"))
