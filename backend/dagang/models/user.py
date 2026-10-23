"""Model user (owner / kasir)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from dagang.extensions import db
from dagang.models.base import TimestampMixin


class User(db.Model, TimestampMixin):
    __tablename__ = "users"

    ROLE_OWNER = "owner"
    ROLE_KASIR = "kasir"
    ROLES = (ROLE_OWNER, ROLE_KASIR)

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(
        String(16), nullable=False, default=ROLE_KASIR, server_default=ROLE_KASIR, index=True
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    sales: Mapped[list["Sale"]] = relationship(  # noqa: F821
        back_populates="cashier", foreign_keys="Sale.cashier_id"
    )
    stock_movements: Mapped[list["StockMovement"]] = relationship(  # noqa: F821
        back_populates="user", foreign_keys="StockMovement.user_id"
    )

    @property
    def is_owner(self) -> bool:
        return self.role == self.ROLE_OWNER

    @property
    def display_name(self) -> str:
        return self.full_name or self.username

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "username": self.username,
            "full_name": self.full_name,
            "display_name": self.display_name,
            "role": self.role,
            "is_active": self.is_active,
            "last_login_at": self.last_login_at.isoformat() if self.last_login_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
