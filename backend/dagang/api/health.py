"""Health check API."""

from __future__ import annotations

from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify
from sqlalchemy import text

from dagang.extensions import db

bp = Blueprint("health", __name__, url_prefix="/api/health")


@bp.get("")
def health():
    database_ok = True
    try:
        db.session.execute(text("SELECT 1"))
        db.session.rollback()
    except Exception:
        database_ok = False
        db.session.rollback()

    payload = {
        "status": "ok" if database_ok else "degraded",
        "database": "ok" if database_ok else "error",
        "version": current_app.config.get("APP_VERSION", "0.1.0"),
        "time": datetime.now(timezone.utc).isoformat(),
    }
    return jsonify(payload), 200 if database_ok else 503


@bp.get("/ready")
def ready():
    return health()
