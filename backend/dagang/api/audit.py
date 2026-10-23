"""Blueprint API: baca audit log (khusus owner, read-only)."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

from flask import Blueprint, jsonify, request

from dagang.extensions import db
from dagang.models import AuditLog, User
from dagang.utils.decorators import roles_required
from dagang.utils.errors import ApiError

bp = Blueprint("audit", __name__, url_prefix="/api/audit")


@bp.get("")
@roles_required(User.ROLE_OWNER)
def list_audit():
    query = db.session.query(AuditLog)

    user_id = request.args.get("user_id")
    if user_id:
        try:
            query = query.filter(AuditLog.user_id == int(user_id))
        except ValueError:
            raise ApiError(400, "invalid_filter", "user_id harus angka.")

    action = (request.args.get("action") or "").strip()
    if action:
        query = query.filter(AuditLog.action == action)

    entity = (request.args.get("entity") or "").strip()
    if entity:
        query = query.filter(AuditLog.entity == entity)

    date_from = _parse_date(request.args.get("from"))
    if date_from:
        query = query.filter(AuditLog.created_at >= date_from)

    date_to = _parse_date(request.args.get("to"))
    if date_to:
        query = query.filter(AuditLog.created_at <= date_to)

    try:
        page = max(1, int(request.args.get("page", 1)))
        per_page = min(200, max(1, int(request.args.get("per_page", 50))))
    except ValueError:
        raise ApiError(400, "invalid_pagination", "page/per_page harus angka.")

    total = query.count()
    items = (
        query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return jsonify(
        {
            "items": [entry.to_dict() for entry in items],
            "total": total,
            "page": page,
            "per_page": per_page,
            "pages": (total + per_page - 1) // per_page,
        }
    )


def _parse_date(value: str | None):
    if not value:
        return None
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        raise ApiError(400, "invalid_filter", "Format tanggal harus YYYY-MM-DD.")
    return datetime.combine(parsed, time.min)
