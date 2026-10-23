"""Konfigurasi aplikasi berbasis environment variable."""

from __future__ import annotations

import os
from datetime import timedelta


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def build_config():
    """Return class konfigurasi yang dibaca ULTRA pada saat create_app()."""

    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError(
            "DATABASE_URL belum diset. Jalankan lewat docker compose atau export manual."
        )

    secret_key = os.environ.get("SECRET_KEY", "").strip()
    if not secret_key:
        raise RuntimeError("SECRET_KEY belum diset (lihat .env.example).")

    class Config:
        # --- dasar -----------------------------------------------------------
        SECRET_KEY = secret_key
        JSON_SORT_KEYS = False

        # --- database --------------------------------------------------------
        SQLALCHEMY_DATABASE_URI = database_url
        SQLALCHEMY_TRACK_MODIFICATIONS = False
        SQLALCHEMY_ENGINE_OPTIONS = {
            "pool_pre_ping": True,
            "pool_recycle": 1800,
            "pool_size": 10,
            "max_overflow": 20,
            "connect_args": {"options": "-c timezone=Asia/Jakarta"},
        }

        # --- JWT (httpOnly cookie) -------------------------------------------
        JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY") or secret_key
        JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=int(os.environ.get("JWT_ACCESS_HOURS", "12")))
        JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=int(os.environ.get("JWT_REFRESH_DAYS", "7")))
        JWT_TOKEN_LOCATION = ["cookies"]
        JWT_COOKIE_SECURE = True
        JWT_COOKIE_HTTPONLY = True
        JWT_COOKIE_SAMESITE = "Lax"
        JWT_COOKIE_CSRF_PROTECT = True
        JWT_CSRF_IN_COOKIES = True
        JWT_CSRF_METHODS = ["POST", "PUT", "PATCH", "DELETE"]
        JWT_ACCESS_CSRF_HEADER_NAME = "X-CSRF-TOKEN"
        JWT_REFRESH_CSRF_HEADER_NAME = "X-CSRF-TOKEN"
        JWT_ERROR_MESSAGE_KEY = "message"
        # auto | true | false -> auto: Secure mengikuti skema request
        COOKIE_SECURE_MODE = os.environ.get("COOKIE_SECURE", "auto").strip().lower()

        # --- rate limit ------------------------------------------------------
        RATELIMIT_STORAGE_URI = "memory://"
        RATELIMIT_HEADERS_ENABLED = True

        # --- path data -------------------------------------------------------
        UPLOAD_FOLDER = os.environ.get("UPLOAD_FOLDER", "/data/uploads")
        LOG_FOLDER = os.environ.get("LOG_FOLDER", "/data/logs")
        BACKUP_FOLDER = os.environ.get("BACKUP_FOLDER", "/data/backups")
        MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "8"))
        MAX_CONTENT_LENGTH = MAX_UPLOAD_MB * 1024 * 1024

        # --- publik ----------------------------------------------------------
        BASE_URL = os.environ.get("BASE_URL", "http://localhost:8787").rstrip("/")
        OWNER_USERNAME = os.environ.get("OWNER_USERNAME", "owner")
        OWNER_PASSWORD = os.environ.get("OWNER_PASSWORD", "")
        LOGIN_MAX_ATTEMPTS = int(os.environ.get("LOGIN_MAX_ATTEMPTS", "5"))
        LOGIN_LOCKOUT_MINUTES = int(os.environ.get("LOGIN_LOCKOUT_MINUTES", "10"))

        # --- identitas toko (printed di struk) --------------------------------
        STORE_NAME = os.environ.get("STORE_NAME", "Warung DPR")
        STORE_ADDRESS = os.environ.get("STORE_ADDRESS", "")
        STORE_PHONE = os.environ.get("STORE_PHONE", "")
        STORE_FOOTER = os.environ.get(
            "STORE_FOOTER", "Terima kasih telah berbelanja!"
        )

        # --- email struk (opsional, default mati) ----------------------------
        SMTP_ENABLED = _as_bool(os.environ.get("SMTP_ENABLED"), False)
        SMTP_HOST = os.environ.get("SMTP_HOST", "")
        SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
        SMTP_USER = os.environ.get("SMTP_USER", "")
        SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
        SMTP_FROM_EMAIL = os.environ.get("SMTP_FROM_EMAIL", "")
        SMTP_USE_TLS = _as_bool(os.environ.get("SMTP_USE_TLS"), True)

    return Config
