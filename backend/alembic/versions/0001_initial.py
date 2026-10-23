"""skema inti Dagang (users, categories, products, sales, sale_items,
payments, stock_movements, audit_logs)

Revision ID: 0001_initial
Revises:
Create Date: 2026-10-21
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

MONEY = sa.Numeric(14, 2)


def upgrade() -> None:
    # ------------------------------- users -----------------------------------
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("username", sa.String(64), nullable=False),
        sa.Column("full_name", sa.String(120), nullable=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(16), nullable=False, server_default="kasir"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("username", name="uq_users_username"),
    )
    op.create_index("ix_users_username", "users", ["username"])
    op.create_index("ix_users_role", "users", ["role"])
    op.create_index("ix_users_is_active", "users", ["is_active"])
    op.create_index("ix_users_created_at", "users", ["created_at"])

    # ---------------------------- categories ---------------------------------
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("name", name="uq_categories_name"),
    )
    op.create_index("ix_categories_is_active", "categories", ["is_active"])
    op.create_index("ix_categories_created_at", "categories", ["created_at"])

    # ----------------------------- products ---------------------------------
    op.create_table(
        "products",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("sku", sa.String(64), nullable=False),
        sa.Column("barcode", sa.String(64), nullable=True),
        sa.Column("name", sa.String(180), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category_id", sa.Integer(), nullable=True),
        sa.Column("price_sale", MONEY, nullable=False, server_default="0"),
        sa.Column("price_purchase", MONEY, nullable=False, server_default="0"),
        sa.Column("stock", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("min_stock", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("unit", sa.String(24), nullable=False, server_default="pcs"),
        sa.Column("image_path", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["category_id"], ["categories.id"], name="fk_products_category", ondelete="SET NULL"
        ),
        sa.UniqueConstraint("sku", name="uq_products_sku"),
        sa.UniqueConstraint("barcode", name="uq_products_barcode"),
    )
    op.create_index("ix_products_sku", "products", ["sku"], unique=True)
    op.create_index("ix_products_barcode", "products", ["barcode"], unique=True)
    op.create_index("ix_products_name", "products", ["name"])
    op.create_index("ix_products_category_id", "products", ["category_id"])
    op.create_index("ix_products_is_active", "products", ["is_active"])
    op.create_index("ix_products_created_at", "products", ["created_at"])

    # ------------------------------- sales -----------------------------------
    op.create_table(
        "sales",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("invoice_no", sa.String(32), nullable=False),
        sa.Column("cashier_id", sa.Integer(), nullable=False),
        sa.Column("subtotal", MONEY, nullable=False, server_default="0"),
        sa.Column("discount", MONEY, nullable=False, server_default="0"),
        sa.Column("total", MONEY, nullable=False, server_default="0"),
        sa.Column("status", sa.String(16), nullable=False, server_default="paid"),
        sa.Column("customer_name", sa.String(120), nullable=True),
        sa.Column("customer_phone", sa.String(32), nullable=True),
        sa.Column("receipt_token", sa.String(64), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("voided_by_id", sa.Integer(), nullable=True),
        sa.Column("void_reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["cashier_id"], ["users.id"], name="fk_sales_cashier", ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["voided_by_id"], ["users.id"], name="fk_sales_voided_by", ondelete="SET NULL"
        ),
        sa.UniqueConstraint("invoice_no", name="uq_sales_invoice_no"),
        sa.UniqueConstraint("receipt_token", name="uq_sales_receipt_token"),
    )
    op.create_index("ix_sales_invoice_no", "sales", ["invoice_no"], unique=True)
    op.create_index("ix_sales_receipt_token", "sales", ["receipt_token"], unique=True)
    op.create_index("ix_sales_cashier_id", "sales", ["cashier_id"])
    op.create_index("ix_sales_status", "sales", ["status"])
    op.create_index("ix_sales_created_at", "sales", ["created_at"])

    # ---------------------------- sale_items ---------------------------------
    op.create_table(
        "sale_items",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("sale_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=True),
        sa.Column("qty", sa.Integer(), nullable=False),
        sa.Column("product_name", sa.String(180), nullable=False),
        sa.Column("product_sku", sa.String(64), nullable=True),
        sa.Column("unit_price", MONEY, nullable=False),
        sa.Column("subtotal", MONEY, nullable=False),
        sa.ForeignKeyConstraint(
            ["sale_id"], ["sales.id"], name="fk_sale_items_sale", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["product_id"], ["products.id"], name="fk_sale_items_product", ondelete="SET NULL"
        ),
    )
    op.create_index("ix_sale_items_sale_id", "sale_items", ["sale_id"])
    op.create_index("ix_sale_items_product_id", "sale_items", ["product_id"])

    # ----------------------------- payments ----------------------------------
    op.create_table(
        "payments",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("sale_id", sa.Integer(), nullable=False),
        sa.Column("method", sa.String(16), nullable=False),
        sa.Column("amount", MONEY, nullable=False),
        sa.Column("reference", sa.String(120), nullable=True),
        sa.Column("change_amount", MONEY, nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["sale_id"], ["sales.id"], name="fk_payments_sale", ondelete="CASCADE"
        ),
    )
    op.create_index("ix_payments_sale_id", "payments", ["sale_id"])
    op.create_index("ix_payments_method", "payments", ["method"])

    # -------------------------- stock_movements ------------------------------
    op.create_table(
        "stock_movements",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("qty", sa.Integer(), nullable=False),
        sa.Column("movement_type", sa.String(16), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("sale_id", sa.Integer(), nullable=True),
        sa.Column("ref", sa.String(64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["product_id"], ["products.id"], name="fk_stock_movements_product", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_stock_movements_user", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["sale_id"], ["sales.id"], name="fk_stock_movements_sale", ondelete="SET NULL"
        ),
    )
    op.create_index("ix_stock_movements_product_id", "stock_movements", ["product_id"])
    op.create_index("ix_stock_movements_movement_type", "stock_movements", ["movement_type"])
    op.create_index("ix_stock_movements_user_id", "stock_movements", ["user_id"])
    op.create_index("ix_stock_movements_sale_id", "stock_movements", ["sale_id"])
    op.create_index("ix_stock_movements_ref", "stock_movements", ["ref"])
    op.create_index("ix_stock_movements_created_at", "stock_movements", ["created_at"])

    # ---------------------------- audit_logs ---------------------------------
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("username", sa.String(64), nullable=True),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("entity", sa.String(64), nullable=True),
        sa.Column("entity_id", sa.String(64), nullable=True),
        sa.Column("before_data", sa.JSON(), nullable=True),
        sa.Column("after_data", sa.JSON(), nullable=True),
        sa.Column("ip", sa.String(64), nullable=True),
        sa.Column("user_agent", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_audit_logs_user", ondelete="SET NULL"
        ),
    )
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])
    op.create_index("ix_audit_logs_username", "audit_logs", ["username"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
    op.create_index("ix_audit_logs_entity", "audit_logs", ["entity"])
    op.create_index("ix_audit_logs_entity_id", "audit_logs", ["entity_id"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])
    op.create_index("ix_audit_logs_created_action", "audit_logs", ["created_at", "action"])


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("stock_movements")
    op.drop_table("payments")
    op.drop_table("sale_items")
    op.drop_table("sales")
    op.drop_table("products")
    op.drop_table("categories")
    op.drop_table("users")
