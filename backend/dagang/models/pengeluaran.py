from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from dagang.extensions import db


class PengeluaranKategori(db.Model):
    __tablename__ = "pengeluaran_kategori"

    id: Mapped[int] = mapped_column(primary_key=True)
    nama: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    pengeluarans = relationship("Pengeluaran", back_populates="kategori")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "nama": self.nama,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Pengeluaran(db.Model):
    __tablename__ = "pengeluaran"

    id: Mapped[int] = mapped_column(primary_key=True)
    tanggal: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    kategori_id: Mapped[int | None] = mapped_column(ForeignKey("pengeluaran_kategori.id"), nullable=True, index=True)
    kategori_nama: Mapped[str | None] = mapped_column(String(100), nullable=True)
    nominal: Mapped[int] = mapped_column(Integer, nullable=False)
    keterangan: Mapped[str | None] = mapped_column(Text, nullable=True)
    metode_bayar: Mapped[str] = mapped_column(String(20), nullable=False, default="tunai")
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    kategori = relationship("PengeluaranKategori", back_populates="pengeluarans")
    created_by = relationship("User")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "tanggal": self.tanggal.isoformat() if self.tanggal else None,
            "kategori_id": self.kategori_id,
            "kategori_nama": self.kategori_nama or (self.kategori.nama if self.kategori else None),
            "nominal": self.nominal,
            "keterangan": self.keterangan,
            "metode_bayar": self.metode_bayar,
            "created_by_id": self.created_by_id,
            "created_by": {
                "id": self.created_by.id,
                "username": self.created_by.username,
                "display_name": self.created_by.display_name,
            } if self.created_by else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
