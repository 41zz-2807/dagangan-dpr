"""Model pergerakan stok (penjualan, restock, adjust, void)."""

from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from dagang.extensions import db
from dagang.models.base import TimestampMixin


class StockMovement(db.Model, TimestampMixin):
    __tablename__ = "stock_movements"

    TYPE_SALE = "sale"
    TYPE_RESTOCK = "restock"
    TYPE_ADJUST = "adjust"
    TYPE_VOID = "void"
    TYPES = (TYPE_SALE, TYPE_RESTOCK, TYPE_ADJUST, TYPE_VOID)

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    qty: Mapped[int] = mapped_column(
        Integer, nullable=False, doc="bertanda: negatif keluar, positif masuk"
    )
    movement_type: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    sale_id: Mapped[int | None] = mapped_column(
        ForeignKey("sales.id", ondelete="SET NULL"), nullable=True, index=True
    )
    ref: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    product = relationship("Product", back_populates="stock_movements")
    user = relationship("User", foreign_keys=[user_id], back_populates="stock_movements")
    sale = relationship("Sale", foreign_keys=[sale_id], back_populates="stock_movements")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "product_id": self.product_id,
            "product_name": self.product.name if self.product else None,
            "qty": self.qty,
            "movement_type": self.movement_type,
            "reason": self.reason,
            "user_id": self.user_id,
            "username": self.user.username if self.user else None,
            "sale_id": self.sale_id,
            "ref": self.ref,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
