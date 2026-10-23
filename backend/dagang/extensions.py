"""Ekstensi Flask yang di-share (SQLAlchemy, JWT, rate limit)."""

from __future__ import annotations

from flask_jwt_extended import JWTManager
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base deklaratif SQLAlchemy 2.x."""


db = SQLAlchemy(model_class=Base)
jwt = JWTManager()
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri="memory://",
    default_limits=[],
    headers_enabled=True,
)
