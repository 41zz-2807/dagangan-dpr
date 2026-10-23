from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from dagang.extensions import db


class Shift(db.Model):
    __tablename__ = "shifts"

    id: Mapped[int] = mapped_column(primary_key=True)
    cashier_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    opening_balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    closing_balance: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    cash_sales: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    cash_in_drawer: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    difference: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="open")

    cashier = relationship("User", foreign_keys=[cashier_id])
    transactions = relationship("ShiftTransaction", back_populates="shift", cascade="all, delete-orphan")

    def to_dict(self, include_details: bool = False) -> dict:
        data = {
            "id": self.id,
            "cashier_id": self.cashier_id,
            "cashier": {
                "id": self.cashier.id,
                "username": self.cashier.username,
                "display_name": self.cashier.display_name,
            } if self.cashier else None,
            "opened_at": self.opened_at.isoformat() if self.opened_at else None,
            "closed_at": self.closed_at.isoformat() if self.closed_at else None,
            "opening_balance": str(self.opening_balance or 0),
            "closing_balance": str(self.closing_balance or 0) if self.closing_balance is not None else None,
            "cash_sales": str(self.cash_sales or 0),
            "expected_cash": (
                str((self.opening_balance or 0) + (self.cash_sales or 0))
                if self.closed_at
                else None
            ),
            "cash_in_drawer": str(self.cash_in_drawer or 0) if self.cash_in_drawer is not None else None,
            "difference": str(self.difference or 0) if self.difference is not None else None,
            "notes": self.notes,
            "status": self.status,
        }
        if include_details:
            data["transactions"] = [t.to_dict() for t in self.transactions]
        return data


class ShiftTransaction(db.Model):
    __tablename__ = "shift_transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    shift_id: Mapped[int] = mapped_column(ForeignKey("shifts.id"), nullable=False, index=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    shift = relationship("Shift", back_populates="transactions")
    sale = relationship("Sale")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "shift_id": self.shift_id,
            "sale_id": self.sale_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "sale": self.sale.to_dict() if self.sale else None,
        }
