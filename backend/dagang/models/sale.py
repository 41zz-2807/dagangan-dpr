"""Model penjualan (header), item & pembayaran."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from dagang.extensions import db
from dagang.models.base import TimestampMixin

MONEY = Numeric(14, 2)


class Sale(db.Model, TimestampMixin):
    __tablename__ = "sales"

    STATUS_PAID = "paid"
    STATUS_VOID = "void"
    STATUSES = (STATUS_PAID, STATUS_VOID)

    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_no: Mapped[str] = mapped_column(
        String(32), unique=True, nullable=False, index=True
    )
    cashier_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    subtotal: Mapped[Decimal] = mapped_column(
        MONEY, nullable=False, default=Decimal("0"), server_default="0"
    )
    discount: Mapped[Decimal] = mapped_column(
        MONEY, nullable=False, default=Decimal("0"), server_default="0"
    )
    total: Mapped[Decimal] = mapped_column(
        MONEY, nullable=False, default=Decimal("0"), server_default="0"
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=STATUS_PAID, server_default=STATUS_PAID, index=True
    )
    customer_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    customer_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    receipt_token: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, index=True
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    voided_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    void_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    cashier = relationship("User", foreign_keys=[cashier_id], back_populates="sales")
    voided_by = relationship("User", foreign_keys=[voided_by_id])
    items: Mapped[list["SaleItem"]] = relationship(
        back_populates="sale", cascade="all, delete-orphan", order_by="SaleItem.id"
    )
    payments: Mapped[list["Payment"]] = relationship(
        back_populates="sale", cascade="all, delete-orphan", order_by="Payment.id"
    )
    stock_movements: Mapped[list["StockMovement"]] = relationship(  # noqa: F821
        back_populates="sale", foreign_keys="StockMovement.sale_id"
    )

    @property
    def is_void(self) -> bool:
        return self.status == self.STATUS_VOID

    def to_dict(self, detail: bool = False) -> dict:
        data = {
            "id": self.id,
            "invoice_no": self.invoice_no,
            "cashier": {
                "id": self.cashier.id,
                "username": self.cashier.username,
                "display_name": self.cashier.display_name,
            }
            if self.cashier
            else None,
            "subtotal": str(self.subtotal),
            "discount": str(self.discount),
            "total": str(self.total),
            "status": self.status,
            "customer_name": self.customer_name,
            "customer_phone": self.customer_phone,
            "receipt_token": self.receipt_token,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "voided_at": self.voided_at.isoformat() if self.voided_at else None,
            "void_reason": self.void_reason,
        }
        if detail:
            data["note"] = self.note
            data["items"] = [item.to_dict() for item in self.items]
            data["payments"] = [p.to_dict() for p in self.payments]
            data["voided_by"] = (
                {
                    "id": self.voided_by.id,
                    "username": self.voided_by.username,
                    "display_name": self.voided_by.display_name,
                }
                if self.voided_by
                else None
            )
        return data


class SaleItem(db.Model):
    """Snapshot item penjualan (nama & harga saat transaksi)."""

    __tablename__ = "sale_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    sale_id: Mapped[int] = mapped_column(
        ForeignKey("sales.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[int | None] = mapped_column(
        ForeignKey("products.id", ondelete="SET NULL"), nullable=True, index=True
    )
    qty: Mapped[int] = mapped_column(Integer, nullable=False)
    product_name: Mapped[str] = mapped_column(String(180), nullable=False)
    product_sku: Mapped[str | None] = mapped_column(String(64), nullable=True)
    unit_price: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(MONEY, nullable=False)

    sale = relationship("Sale", back_populates="items")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "product_id": self.product_id,
            "qty": self.qty,
            "product_name": self.product_name,
            "product_sku": self.product_sku,
            "unit_price": str(self.unit_price),
            "subtotal": str(self.subtotal),
        }


class Payment(db.Model):
    """Pembayaran. Saat ini satu metode per transaksi, skema siap untuk split."""

    __tablename__ = "payments"

    METHOD_CASH = "cash"
    METHOD_TRANSFER = "transfer"
    METHOD_QRIS = "qris"
    METHODS = (METHOD_CASH, METHOD_TRANSFER, METHOD_QRIS)

    id: Mapped[int] = mapped_column(primary_key=True)
    sale_id: Mapped[int] = mapped_column(
        ForeignKey("sales.id", ondelete="CASCADE"), nullable=False, index=True
    )
    method: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    reference: Mapped[str | None] = mapped_column(String(120), nullable=True)
    change_amount: Mapped[Decimal] = mapped_column(
        MONEY, nullable=False, default=Decimal("0"), server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    sale = relationship("Sale", back_populates="payments")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "method": self.method,
            "amount": str(self.amount),
            "reference": self.reference,
            "change_amount": str(self.change_amount),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
