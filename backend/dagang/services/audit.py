"""Audit log: disimpan di tabel `audit_logs` DAN file JSON Lines di /data/logs."""

from __future__ import annotations

import json
import logging
import os
import threading
from datetime import datetime, timezone
from typing import Any

from flask import has_request_context, request

from dagang.extensions import db
from dagang.models import AuditLog

logger = logging.getLogger("dagang.audit")

_write_lock = threading.Lock()
_LOG_FOLDER = os.environ.get("LOG_FOLDER", "/data/logs")


def _client_ip() -> str | None:
    if not has_request_context():
        return None
    cf_ip = request.headers.get("CF-Connecting-IP")
    if cf_ip:
        return cf_ip[:64]
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    return (request.remote_addr or "")[:64] or None


def _user_agent() -> str | None:
    if not has_request_context():
        return None
    return (request.headers.get("User-Agent") or "")[:255] or None


def _file_path(now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    return os.path.join(_LOG_FOLDER, f"audit-{now.strftime('%Y-%m-%d')}.log")


def _write_file(payload: dict) -> None:
    """Tulis satu baris JSON ke file audit (best effort, tidak boleh gagalkan request)."""
    try:
        os.makedirs(_LOG_FOLDER, exist_ok=True)
        line = json.dumps(payload, ensure_ascii=False, default=str)
        with _write_lock:
            with open(_file_path(), "a", encoding="utf-8") as handle:
                handle.write(line + "\n")
    except Exception:  # pragma: no cover - filesystem
        logger.exception("Gagal menulis audit log ke file")


def record(
    action: str,
    *,
    user: Any | None = None,
    entity: str | None = None,
    entity_id: Any | None = None,
    before: Any | None = None,
    after: Any | None = None,
    commit: bool = True,
    extra: dict | None = None,
) -> AuditLog:
    """Catat aktivitas ke audit_logs (DB) + file log.

    `commit=False` dipakai saat pemanggilan berada di dalam transaksi lain
    (mis. saat checkout) supaya audit ikut COMMIT/ROLLBACK bareng.
    """
    user_id = getattr(user, "id", None)
    username = getattr(user, "username", None)
    created = datetime.now(timezone.utc)

    entry = AuditLog(
        user_id=user_id,
        username=username,
        action=action,
        entity=entity,
        entity_id=str(entity_id) if entity_id is not None else None,
        before_data=before,
        after_data=after,
        ip=_client_ip(),
        user_agent=_user_agent(),
    )
    db.session.add(entry)
    if commit:
        db.session.commit()
    else:
        db.session.flush()

    payload = {
        "ts": created.isoformat(),
        "action": action,
        "user_id": user_id,
        "username": username,
        "entity": entity,
        "entity_id": str(entity_id) if entity_id is not None else None,
        "before": before,
        "after": after,
        "ip": _client_ip(),
        "user_agent": _user_agent(),
    }
    if extra:
        payload["extra"] = extra
    _write_file(payload)
    return entry
