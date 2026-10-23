"""CLI aplikasi: wait-db, seed-owner, create-user, reset-password."""

from __future__ import annotations

import os
import sys
import time

import click


def _app():
    from dagang import create_app

    return create_app()


def wait_db(timeout: int = 120) -> None:
    """Tunggu sampai PostgreSQL menerima koneksi."""
    from sqlalchemy import text

    from dagang.extensions import db

    app = _app()
    deadline = time.time() + timeout
    last_error = None
    while time.time() < deadline:
        try:
            with app.app_context():
                db.session.execute(text("SELECT 1"))
                db.session.rollback()
            print("[dagang] database siap")
            return
        except Exception as exc:
            last_error = exc
            time.sleep(2)
    raise SystemExit(f"[dagang] database tidak siap setelah {timeout}s: {last_error}")


def seed_owner() -> None:
    from dagang.extensions import db
    from dagang.models import User
    from dagang.services.audit import record
    from dagang.services.security import hash_password, verify_password

    username = (os.environ.get("OWNER_USERNAME") or "owner").strip().lower()
    password = os.environ.get("OWNER_PASSWORD") or ""

    if not password:
        print("[dagang] OWNER_PASSWORD kosong, lewati seed owner")
        return

    app = _app()
    with app.app_context():
        user = db.session.query(User).filter(User.username == username).one_or_none()
        if user is None:
            user = User(username=username, full_name="Owner Toko", role=User.ROLE_OWNER, is_active=True)
            user.password_hash = hash_password(password)
            db.session.add(user)
            db.session.commit()
            record("auth.seed_owner", user=user, entity="users", entity_id=user.id, after={"username": user.username}, commit=True)
            print(f"[dagang] owner dibuat: {username}")
            return
        if not verify_password(password, user.password_hash):
            user.password_hash = hash_password(password)
            db.session.commit()
            record("auth.seed_owner", user=user, entity="users", entity_id=user.id, after={"username": user.username, "action": "reset_password"}, commit=True)
            print(f"[dagang] password owner diperbarui: {username}")
            return
        print(f"[dagang] owner sudah ada: {username}")


def create_user(username: str, password: str, role: str = "kasir", full_name: str = "") -> None:
    from dagang.extensions import db
    from dagang.models import User
    from dagang.services.audit import record
    from dagang.services.security import hash_password

    username_clean = username.strip().lower()
    password_clean = password
    role_clean = role.strip().lower()
    if role_clean not in {User.ROLE_OWNER, User.ROLE_KASIR}:
        raise SystemExit("role harus owner atau kasir")

    app = _app()
    with app.app_context():
        user = db.session.query(User).filter(User.username == username_clean).one_or_none()
        if user is not None:
            raise SystemExit("username sudah digunakan")
        user = User(
            username=username_clean,
            full_name=full_name.strip() or username_clean,
            role=role_clean,
            is_active=True,
        )
        user.password_hash = hash_password(password_clean)
        db.session.add(user)
        db.session.commit()
        record("user.create", user=user, entity="users", entity_id=user.id, after={"username": user.username, "role": user.role}, commit=True)
        print(f"[dagang] user dibuat: {username_clean} ({role_clean})")


def register_cli(app) -> None:
    @app.cli.command("wait-db")
    def wait_db_cmd():
        wait_db()

    @app.cli.command("seed-owner")
    def seed_owner_cmd():
        seed_owner()

    @app.cli.command("create-user")
    @click.argument("username")
    @click.argument("password")
    @click.option("--role", default="kasir", type=click.Choice(["owner", "kasir"]))
    @click.option("--name", default="", help="Nama lengkap")
    def create_user_cmd(username, password, role, name):
        create_user(username, password, role, name)

    @app.cli.command("init-shift-tables")
    def init_shift_tables_cmd():
        from dagang.models import shift, stock_opname
        from dagang.extensions import db
        db.create_all()
        click.echo("Done")


if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    if command == "wait-db":
        wait_db()
    elif command == "seed-owner":
        seed_owner()
    elif command == "create-user":
        if len(sys.argv) < 4:
            raise SystemExit("pemakaian: python -m dagang.cli create-user <username> <password>")
        create_user(sys.argv[2], sys.argv[3])
    else:
        print("perintah: wait-db | seed-owner | create-user <username> <password>")
        sys.exit(2)
