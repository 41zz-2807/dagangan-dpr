"""Model kategori produk."""

from __future__ import annotations

from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from dagang.extensions import db
from dagang.models.base import TimestampMixin


class Category(db.Model, TimestampMixin):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true", index=True
    )

    products: Mapped[list["Product"]] = relationship(  # noqa: F821
        back_populates="category", order_by="Product.name"
    )

    def to_dict(self, with_counts: bool = False) -> dict:
        data = {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if with_counts:
            data["product_count"] = len(self.products)
        return data
