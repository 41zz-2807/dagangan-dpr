"""penjualan: sequence nomor invoice + indeks query transaksi

Revision ID: 0003_sales
Revises: 0002_login_attempts
Create Date: 2026-10-21
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0003_sales"
down_revision = "0002_login_attempts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Nomor invoice dibuat dari sequence supaya tetap unik saat dua kasir
    # menyimpan transaksi bersamaan (tidak ada race pada nomor urut).
    op.execute("CREATE SEQUENCE IF NOT EXISTS sale_invoice_seq START 1")
    op.execute("SELECT setval('sale_invoice_seq', 1, false)")

    op.create_index(
        "ix_sales_cashier_created", "sales", ["cashier_id", "created_at"]
    )
    op.create_index("ix_sales_status_created", "sales", ["status", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_sales_status_created", table_name="sales")
    op.drop_index("ix_sales_cashier_created", table_name="sales")
    op.execute("DROP SEQUENCE IF EXISTS sale_invoice_seq")
