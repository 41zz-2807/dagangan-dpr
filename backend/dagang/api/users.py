"""Blueprint API: manajemen user (khusus owner)."""

from __future__ import annotations

from flask import Blueprint, jsonify, request
from sqlalchemy import func, or_

from dagang.extensions import db
from dagang.models import User
from dagang.schemas import UserCreateRequest, UserUpdateRequest
from dagang.services.audit import record
from dagang.services.security import hash_password
from dagang.utils.decorators import load_current_user, roles_required
from dagang.utils.errors import ApiError
from dagang.utils.validators import parse_body

bp = Blueprint("users", __name__, url_prefix="/api/users")


@bp.get("")
@roles_required(User.ROLE_OWNER)
def list_users():
    query = db.session.query(User)

    search = (request.args.get("q") or "").strip()
    if search:
        pattern = f"%{search.lower()}%"
        query = query.filter(
            or_(
                func.lower(User.username).like(pattern),
                func.lower(func.coalesce(User.full_name, "")).like(pattern),
            )
        )

    role = (request.args.get("role") or "").strip().lower()
    if role in {User.ROLE_OWNER, User.ROLE_KASIR}:
        query = query.filter(User.role == role)

    active = request.args.get("is_active")
    if active in {"true", "1"}:
        query = query.filter(User.is_active.is_(True))
    elif active in {"false", "0"}:
        query = query.filter(User.is_active.is_(False))

    users = query.order_by(User.role.desc(), User.username).all()
    return jsonify({"items": [user.to_dict() for user in users], "total": len(users)})


@bp.post("")
@roles_required(User.ROLE_OWNER)
def create_user():
    data = parse_body(UserCreateRequest)
    owner = load_current_user()

    exists = (
        db.session.query(User)
        .filter(func.lower(User.username) == data.username.lower())
        .one_or_none()
    )
    if exists is not None:
        raise ApiError(409, "username_exists", "Username sudah digunakan.")

    user = User(
        username=data.username.lower(),
        full_name=data.full_name or data.username.lower(),
        password_hash=hash_password(data.password),
        role=data.role,
        is_active=True,
    )
    db.session.add(user)
    db.session.commit()

    record(
        "user.create",
        user=owner,
        entity="users",
        entity_id=user.id,
        after={"username": user.username, "role": user.role, "is_active": user.is_active},
    )
    return jsonify({"user": user.to_dict()}), 201


@bp.patch("/<int:user_id>")
@roles_required(User.ROLE_OWNER)
def update_user(user_id: int):
    data = parse_body(UserUpdateRequest)
    owner = load_current_user()

    user = db.session.get(User, user_id)
    if user is None:
        raise ApiError(404, "not_found", "User tidak ditemukan.")

    before = user.to_dict()

    if data.full_name is not None:
        user.full_name = data.full_name
    if data.role is not None:
        if user.id == owner.id and data.role != User.ROLE_OWNER:
            raise ApiError(400, "cannot_change_own_role", "Anda tidak bisa menurunkan role akun sendiri.")
        if (
            user.role == User.ROLE_OWNER
            and data.role != User.ROLE_OWNER
            and _owner_count() <= 1
        ):
            raise ApiError(400, "last_owner", "Minimal harus ada satu owner aktif.")
        user.role = data.role
    if data.is_active is not None:
        if user.id == owner.id and not data.is_active:
            raise ApiError(400, "cannot_deactivate_self", "Anda tidak bisa menonaktifkan akun sendiri.")
        if (
            not data.is_active
            and user.role == User.ROLE_OWNER
            and _owner_count() <= 1
        ):
            raise ApiError(400, "last_owner", "Minimal harus ada satu owner aktif.")
        user.is_active = data.is_active
    if data.password:
        user.password_hash = hash_password(data.password)

    db.session.commit()

    record(
        "user.update",
        user=owner,
        entity="users",
        entity_id=user.id,
        before=before,
        after=user.to_dict(),
    )
    return jsonify({"user": user.to_dict()})


@bp.delete("/<int:user_id>")
@roles_required(User.ROLE_OWNER)
def deactivate_user(user_id: int):
    owner = load_current_user()
    user = db.session.get(User, user_id)
    if user is None:
        raise ApiError(404, "not_found", "User tidak ditemukan.")
    if user.id == owner.id:
        raise ApiError(400, "cannot_deactivate_self", "Anda tidak bisa menonaktifkan akun sendiri.")
    if user.role == User.ROLE_OWNER and _owner_count() <= 1:
        raise ApiError(400, "last_owner", "Minimal harus ada satu owner aktif.")

    before = user.to_dict()
    user.is_active = False
    db.session.commit()

    record(
        "user.deactivate",
        user=owner,
        entity="users",
        entity_id=user.id,
        before=before,
        after=user.to_dict(),
    )
    return jsonify({"user": user.to_dict()})


def _owner_count() -> int:
    return (
        db.session.query(User)
        .filter(User.role == User.ROLE_OWNER, User.is_active.is_(True))
        .count()
    )
