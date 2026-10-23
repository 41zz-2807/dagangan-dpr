"""Schema validasi (pydantic v2)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator


class LoginRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=4, max_length=128)


class ChangePasswordRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    old_password: str = Field(min_length=4, max_length=128)
    new_password: str = Field(min_length=6, max_length=128)


class UserCreateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=6, max_length=128)
    full_name: str = Field(default="", max_length=120)
    role: str = Field(default="kasir", max_length=16)

    @field_validator("username")
    @classmethod
    def _username_charset(cls, value: str) -> str:
        value = value.lower()
        if not value.replace("_", "").replace(".", "").replace("-", "").isalnum():
            raise ValueError("username hanya boleh huruf, angka, titik, _ dan -")
        return value

    @field_validator("role")
    @classmethod
    def _role_valid(cls, value: str) -> str:
        value = value.lower()
        if value not in {"owner", "kasir"}:
            raise ValueError("role harus 'owner' atau 'kasir'")
        return value


class UserUpdateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    full_name: str | None = Field(default=None, max_length=120)
    role: str | None = Field(default=None, max_length=16)
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=6, max_length=128)

    @field_validator("role")
    @classmethod
    def _role_valid(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.lower()
        if value not in {"owner", "kasir"}:
            raise ValueError("role harus 'owner' atau 'kasir'")
        return value


class UserOut(BaseModel):
    id: int
    username: str
    full_name: str | None = None
    role: str
    is_active: bool
    last_login_at: datetime | None = None
    created_at: datetime | None = None


# --------------------------------------------------------------------------
# Kategori & Produk (tahap 2)
# --------------------------------------------------------------------------
Money = Annotated[Decimal, Field(max_digits=14, decimal_places=2, ge=0)]


class CategoryCreateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)


class CategoryUpdateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    is_active: bool | None = None


class ProductCreateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    sku: str | None = Field(default=None, max_length=64)
    name: str = Field(min_length=1, max_length=180)
    barcode: str | None = Field(default=None, max_length=64)
    description: str | None = Field(default=None, max_length=1000)
    category_id: int | None = None
    price_sale: Money = Decimal("0")
    price_purchase: Money = Decimal("0")
    stock: int = Field(default=0, ge=0, le=1_000_000)
    min_stock: int = Field(default=0, ge=0, le=1_000_000)
    unit: str = Field(default="pcs", min_length=1, max_length=24)
    image_path: str | None = Field(default=None, max_length=255)
    is_active: bool = True

    @field_validator("sku")
    @classmethod
    def _sku_upper(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip().upper()

    @field_validator("barcode")
    @classmethod
    def _barcode(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None

    @field_validator("unit")
    @classmethod
    def _unit_lower(cls, value: str) -> str:
        return value.strip().lower()


class ProductUpdateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    sku: str | None = Field(default=None, min_length=1, max_length=64)
    name: str | None = Field(default=None, min_length=1, max_length=180)
    barcode: str | None = Field(default=None, max_length=64)
    description: str | None = Field(default=None, max_length=1000)
    category_id: int | None = None
    price_sale: Money | None = None
    price_purchase: Money | None = None
    min_stock: int | None = Field(default=None, ge=0, le=1_000_000)
    unit: str | None = Field(default=None, min_length=1, max_length=24)
    image_path: str | None = Field(default=None, max_length=255)
    is_active: bool | None = None

    @field_validator("sku")
    @classmethod
    def _sku_upper(cls, value: str | None) -> str | None:
        return value.strip().upper() if value is not None else None

    @field_validator("barcode")
    @classmethod
    def _barcode(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class StockAdjustRequest(BaseModel):
    """Penyesuaian stok. `reason` wajib (khusus untuk kasir)."""

    model_config = ConfigDict(str_strip_whitespace=True)

    product_id: int = Field(gt=0)
    mode: str = Field(default="delta", max_length=10)
    qty: int = Field(ge=-1_000_000, le=1_000_000)
    reason: str = Field(min_length=3, max_length=300)

    @field_validator("mode")
    @classmethod
    def _mode_valid(cls, value: str) -> str:
        value = value.strip().lower()
        if value not in {"delta", "set"}:
            raise ValueError("mode harus 'delta' atau 'set'")
        return value


# --------------------------------------------------------------------------
# Penjualan (tahap 3)
# --------------------------------------------------------------------------


class SaleItemRequest(BaseModel):
    """Satu baris keranjang. Harga selalu diambil dari server."""

    model_config = ConfigDict(str_strip_whitespace=True)

    product_id: int = Field(gt=0)
    qty: int = Field(gt=0, le=100_000)


class SalePaymentRequest(BaseModel):
    """Pembayaran satu metode. `amount` boleh kosong (server isi dengan total)."""

    model_config = ConfigDict(str_strip_whitespace=True)

    method: str = Field(min_length=1, max_length=16)
    amount: Money | None = None
    reference: str | None = Field(default=None, max_length=120)

    @field_validator("method")
    @classmethod
    def _method_valid(cls, value: str) -> str:
        value = value.strip().lower()
        if value not in {"cash", "transfer", "qris"}:
            raise ValueError("metode harus 'cash', 'transfer', atau 'qris'")
        return value


class SaleCreateRequest(BaseModel):
    """Buat transaksi. Total & kembalian dihitung ulang di server."""

    model_config = ConfigDict(str_strip_whitespace=True)

    items: list[SaleItemRequest] = Field(min_length=1, max_length=200)
    payments: list[SalePaymentRequest] = Field(min_length=1, max_length=5)
    discount: Money = Decimal("0")
    customer_name: str | None = Field(default=None, max_length=120)
    customer_phone: str | None = Field(default=None, max_length=32)
    note: str | None = Field(default=None, max_length=500)


class SaleVoidRequest(BaseModel):
    """Pembatalan transaksi (owner)."""

    model_config = ConfigDict(str_strip_whitespace=True)

    reason: str = Field(min_length=3, max_length=300)
