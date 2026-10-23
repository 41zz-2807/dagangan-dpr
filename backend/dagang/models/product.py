"""Model produk (harga jual/modal, stok, gambar)."""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from dagang.extensions import db
from dagang.models.base import TimestampMixin

MONEY = Numeric(14, 2)


class Product(db.Model, TimestampMixin):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    sku: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    barcode: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(180), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    price_sale: Mapped[Decimal] = mapped_column(
        MONEY, nullable=False, default=Decimal("0"), server_default="0"
    )
    price_purchase: Mapped[Decimal] = mapped_column(
        MONEY, nullable=False, default=Decimal("0"), server_default="0"
    )
    stock: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    min_stock: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    unit: Mapped[str] = mapped_column(
        String(24), nullable=False, default="pcs", server_default="pcs"
    )
    image_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true", index=True
    )

    category: Mapped["Category | None"] = relationship(back_populates="products")  # noqa: F821
    stock_movements: Mapped[list["StockMovement"]] = relationship(  # noqa: F821
        back_populates="product", order_by="StockMovement.created_at.desc()"
    )

    @property
    def is_low_stock(self) -> bool:
        return self.stock <= self.min_stock

    @property
    def margin(self) -> Decimal:
        return (self.price_sale or Decimal("0")) - (self.price_purchase or Decimal("0"))

    def to_dict(self, with_category: bool = True) -> dict:
        data = {
            "id": self.id,
            "sku": self.sku,
            "barcode": self.barcode,
            "name": self.name,
            "description": self.description,
            "price_sale": str(self.price_sale or Decimal("0")),
            "price_purchase": str(self.price_purchase or Decimal("0")),
            "stock": self.stock,
            "min_stock": self.min_stock,
            "unit": self.unit,
            "image_path": self.image_path,
            "is_active": self.is_active,
            "is_low_stock": self.is_low_stock,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if with_category and self.category is not None:
            data["category"] = {"id": self.category.id, "name": self.category.name}
        else:
            data["category"] = None
        return data
