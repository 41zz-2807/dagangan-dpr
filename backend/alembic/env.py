"""Environment Alembic berbasis application context Flask."""

from __future__ import annotations

import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from dagang import create_app  # noqa: E402
from dagang import models  # noqa: E402,F401  (daftarkan semua model)
from dagang.extensions import db  # noqa: E402

config = context.config

if config.config_file_name is not None:
    try:
        fileConfig(config.config_file_name)
    except Exception:  # pragma: no cover - konfigurasi logging opsional
        pass

app = create_app()
with app.app_context():
    target_metadata = db.metadata
    _app_config = app.config


def run_migrations_offline() -> None:
    """Migrasi mode offline (SQL diekspor, tanpa koneksi DB)."""
    url = config.get_main_option("sqlalchemy.url") or _app_config["SQLALCHEMY_DATABASE_URI"]
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Migrasi mode online (koneksi ke database)."""
    config.set_main_option(
        "sqlalchemy.url", _app_config["SQLALCHEMY_DATABASE_URI"].replace("%", "%%")
    )
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()
    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
