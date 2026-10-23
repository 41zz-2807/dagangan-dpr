from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from dagang.extensions import db


class StockOpname(db.Model):
    __tablename__ = "stock_opnames"

    id: Mapped[int] = mapped_column(primary_key=True)
    opname_no: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="draft")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user = relationship("User")
    items = relationship("StockOpnameItem", back_populates="opname", cascade="all, delete-orphan")

    def to_dict(self, include_items: bool = False) -> dict:
        data = {
            "id": self.id,
            "opname_no": self.opname_no,
            "user_id": self.user_id,
            "user": {"id": self.user.id, "username": self.user.username, "display_name": self.user.display_name} if self.user else None,
            "status": self.status,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "items_count": len(self.items),
        }
        if include_items:
            data["items"] = [item.to_dict() for item in self.items]
        return data


class StockOpnameItem(db.Model):
    __tablename__ = "stock_opname_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    opname_id: Mapped[int] = mapped_column(ForeignKey("stock_opnames.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    system_stock: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    physical_stock: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    difference: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    adjusted: Mapped[bool] = mapped_column(nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    opname = relationship("StockOpname", back_populates="items")
    product = relationship("Product")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "opname_id": self.opname_id,
            "product_id": self.product_id,
            "product": self.product.to_dict() if self.product else None,
            "system_stock": self.system_stock,
            "physical_stock": self.physical_stock,
            "difference": self.difference,
            "adjusted": self.adjusted,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
