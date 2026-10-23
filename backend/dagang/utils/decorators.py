"""Decorator hak akses berbasis role (ditegakkan di backend)."""

from __future__ import annotations

from functools import wraps

from flask import g
from flask_jwt_extended import get_jwt_identity, jwt_required

from dagang.extensions import db
from dagang.models import User
from dagang.utils.errors import ApiError


def load_current_user() -> User:
    """Ambil user dari token JWT; 401 bila tidak valid / nonaktif."""
    cached = getattr(g, "current_user", None)
    if cached is not None:
        return cached

    identity = get_jwt_identity()
    if identity is None:
        raise ApiError(401, "unauthorized", "Sesi tidak ditemukan, silakan login")

    try:
        user_id = int(identity)
    except (TypeError, ValueError):
        raise ApiError(401, "unauthorized", "Sesi tidak valid, silakan login ulang")

    user = db.session.get(User, user_id)
    if user is None:
        raise ApiError(401, "unauthorized", "Pengguna tidak ditemukan")
    if not user.is_active:
        raise ApiError(403, "user_inactive", "Akun Anda dinonaktifkan. Hubungi owner.")

    g.current_user = user
    return user


def roles_required(*roles: str):
    """Wajibkan role tertentu (backend enforcement)."""

    def decorator(fn):
        @wraps(fn)
        @jwt_required()
        def wrapper(*args, **kwargs):
            user = load_current_user()
            if roles and user.role not in roles:
                raise ApiError(
                    403,
                    "forbidden",
                    "Anda tidak memiliki izin untuk tindakan ini.",
                )
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def owner_required(fn):
    return roles_required(User.ROLE_OWNER)(fn)


def authenticated(fn):
    """Wajib login, tanpa pembatasan role."""

    @wraps(fn)
    @jwt_required()
    def wrapper(*args, **kwargs):
        load_current_user()
        return fn(*args, **kwargs)

    return wrapper
