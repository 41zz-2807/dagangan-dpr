"""Blueprint API: autentikasi (JWT httpOnly cookie + CSRF)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_jwt_identity,
    jwt_required,
)
from sqlalchemy import func

from dagang.extensions import db, jwt, limiter
from dagang.models import User
from dagang.schemas import ChangePasswordRequest, LoginRequest
from dagang.services.audit import record
from dagang.services.security import (
    LoginThrottle,
    hash_password,
    needs_rehash,
    verify_password,
)
from dagang.utils.cookies import clear_auth_cookies, issue_auth_cookies
from dagang.utils.decorators import authenticated, load_current_user
from dagang.utils.errors import ApiError
from dagang.utils.validators import parse_body

logger = logging.getLogger("dagang.auth")

bp = Blueprint("auth", __name__, url_prefix="/api/auth")

_throttle = LoginThrottle()


def _get_throttle() -> LoginThrottle:
    _throttle.max_attempts = int(current_app.config.get("LOGIN_MAX_ATTEMPTS", 5))
    _throttle.lockout_seconds = int(
        current_app.config.get("LOGIN_LOCKOUT_MINUTES", 10)
    ) * 60
    return _throttle


def _cookie_max_age() -> tuple[int, int]:
    access = current_app.config.get("JWT_ACCESS_TOKEN_EXPIRES")
    refresh = current_app.config.get("JWT_REFRESH_TOKEN_EXPIRES")
    access_seconds = int(access.total_seconds()) if access else 43200
    refresh_seconds = int(refresh.total_seconds()) if refresh else 604800
    return access_seconds, refresh_seconds


def _client_ip() -> str | None:
    ip = request.headers.get("CF-Connecting-IP") or request.remote_addr
    return (ip or "")[:64] or None


def register_jwt_handlers(app) -> None:
    """Bentuk error JWT diseragamkan dengan format JSON API lain."""

    def _response(message: str):
        return (
            jsonify({"error": {"code": "unauthorized", "message": message}}),
            401,
        )

    @jwt.unauthorized_loader
    def _on_missing(reason: str):
        return _response("Sesi tidak ditemukan, silakan login.")

    @jwt.invalid_token_loader
    def _on_invalid(reason: str):
        return _response("Sesi tidak valid, silakan login ulang.")

    @jwt.expired_token_loader
    def _on_expired(jwt_header, jwt_payload):
        return _response("Sesi Anda sudah berakhir, silakan login ulang.")

    @jwt.revoked_token_loader
    def _on_revoked(jwt_header, jwt_payload):
        return _response("Sesi Anda telah dicabut, silakan login ulang.")

    @jwt.needs_fresh_token_loader
    def _on_needs_fresh(jwt_header, jwt_payload):
        return _response("Silakan login ulang untuk melanjutkan.")


@bp.post("/login")
@limiter.limit("10 per minute")
def login():
    data = parse_body(LoginRequest)
    username = data.username.strip().lower()
    throttle = _get_throttle()

    if throttle.is_locked(username):
        wait_minutes = max(1, throttle.retry_after(username) // 60 + 1)
        record(
            "auth.login_blocked",
            entity="users",
            entity_id=username,
            extra={"reason": "throttle", "retry_after_seconds": throttle.retry_after(username)},
        )
        raise ApiError(
            429,
            "too_many_attempts",
            f"Terlalu banyak percobaan login. Coba lagi dalam {wait_minutes} menit.",
        )

    user = (
        db.session.query(User).filter(func.lower(User.username) == username).one_or_none()
    )

    if user is None or not verify_password(data.password, user.password_hash):
        throttle.register_failure(username, _client_ip())
        remaining = throttle.remaining_attempts(username)
        record(
            "auth.login_failed",
            entity="users",
            entity_id=username,
            extra={"remaining_attempts": remaining, "ip": _client_ip()},
        )
        raise ApiError(401, "invalid_credentials", "Username atau password salah.")

    if not user.is_active:
        record("auth.login_blocked", user=user, entity="users", entity_id=user.id,
               extra={"reason": "inactive"})
        raise ApiError(403, "user_inactive", "Akun Anda dinonaktifkan. Hubungi owner.")

    throttle.reset(username)

    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(data.password)

    user.last_login_at = datetime.now(timezone.utc)
    db.session.commit()

    access_token = create_access_token(
        identity=str(user.id),
        additional_claims={"role": user.role, "username": user.username},
    )
    refresh_token = create_refresh_token(identity=str(user.id))

    access_seconds, refresh_seconds = _cookie_max_age()
    response = jsonify({"user": user.to_dict()})
    issue_auth_cookies(
        response,
        access_token=access_token,
        refresh_token=refresh_token,
        max_age=access_seconds,
        refresh_max_age=refresh_seconds,
    )

    record(
        "auth.login",
        user=user,
        entity="users",
        entity_id=user.id,
        after={"username": user.username, "role": user.role},
    )
    return response


@bp.post("/logout")
def logout():
    """Logout tidak mensyaratkan token valid: cookie tetap dibersihkan."""
    user = None
    try:
        encoded = request.cookies.get(current_app.config.get("JWT_ACCESS_COOKIE_NAME", "access_token_cookie"))
        if encoded:
            payload = decode_token(encoded, allow_expired=True)
            identity = payload.get("sub")
            if identity:
                user = db.session.get(User, int(identity))
    except Exception:  # token rusak / kedaluwarsa -> tetap logout
        user = None

    if user is not None:
        record("auth.logout", user=user, entity="users", entity_id=user.id)

    response = jsonify({"ok": True})
    clear_auth_cookies(response)
    return response


@bp.post("/refresh")
@jwt_required(refresh=True)
def refresh():
    identity = get_jwt_identity()
    user = db.session.get(User, int(identity)) if identity else None
    if user is None or not user.is_active:
        raise ApiError(401, "unauthorized", "Sesi tidak valid, silakan login ulang")

    access_token = create_access_token(
        identity=str(user.id),
        additional_claims={"role": user.role, "username": user.username},
    )
    access_seconds, _ = _cookie_max_age()
    response = jsonify({"user": user.to_dict()})
    issue_auth_cookies(response, access_token=access_token, max_age=access_seconds)
    return response


@bp.get("/me")
@authenticated
def me():
    user = load_current_user()
    return jsonify({"user": user.to_dict()})


@bp.post("/change-password")
@authenticated
def change_password():
    user = load_current_user()
    data = parse_body(ChangePasswordRequest)

    if not verify_password(data.old_password, user.password_hash):
        record("auth.change_password_failed", user=user, entity="users", entity_id=user.id)
        raise ApiError(400, "invalid_password", "Password lama tidak cocok.")

    user.password_hash = hash_password(data.new_password)
    db.session.commit()
    record("auth.change_password", user=user, entity="users", entity_id=user.id)
    return jsonify({"ok": True, "message": "Password berhasil diubah."})
