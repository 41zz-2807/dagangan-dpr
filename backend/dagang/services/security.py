"""Keamanan: hash password (argon2id) dan throttle login berbasis database."""

from __future__ import annotations

import threading
import time
from datetime import datetime, timedelta, timezone

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

_hasher = PasswordHasher(time_cost=2, memory_cost=64 * 1024, parallelism=2)

# Data percobaan login lama dibersihkan setelah 30 hari.
RETENTION_DAYS = 30


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        _hasher.verify(password_hash, password)
        return True
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    try:
        return _hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True


class LoginThrottle:
    """Blokir sementara per username setelah beberapa kali gagal login.

    Disimpan di tabel `login_attempts` supaya berlaku lintas worker gunicorn
    (counter in-memory hanya berlaku per proses).
    """

    def __init__(self, max_attempts: int = 5, lockout_minutes: int = 10):
        self.max_attempts = max_attempts
        self.lockout_minutes = lockout_minutes
        self._local = threading.local()

    # -- internal ---------------------------------------------------------
    def _window_start(self) -> datetime:
        return datetime.now(timezone.utc) - timedelta(minutes=self.lockout_minutes)

    def _failures(self, username: str):
        from dagang.extensions import db
        from dagang.models import LoginAttempt

        return (
            db.session.query(LoginAttempt)
            .filter(
                LoginAttempt.username == username,
                LoginAttempt.success.is_(False),
                LoginAttempt.created_at >= self._window_start(),
            )
            .order_by(LoginAttempt.created_at.asc())
            .all()
        )

    # -- public API -------------------------------------------------------
    def is_locked(self, username: str) -> bool:
        return len(self._failures(username)) >= self.max_attempts

    def register_failure(self, username: str, ip: str | None = None) -> None:
        from dagang.extensions import db
        from dagang.models import LoginAttempt

        db.session.add(
            LoginAttempt(username=username, ip=ip, success=False)
        )
        db.session.commit()
        self._cleanup()

    def register_success(self, username: str, ip: str | None = None) -> None:
        from dagang.extensions import db
        from dagang.models import LoginAttempt

        db.session.query(LoginAttempt).filter(
            LoginAttempt.username == username, LoginAttempt.success.is_(False)
        ).delete(synchronize_session=False)
        db.session.add(LoginAttempt(username=username, ip=ip, success=True))
        db.session.commit()

    def reset(self, username: str) -> None:
        from dagang.extensions import db
        from dagang.models import LoginAttempt

        db.session.query(LoginAttempt).filter(
            LoginAttempt.username == username, LoginAttempt.success.is_(False)
        ).delete(synchronize_session=False)
        db.session.commit()

    def remaining_attempts(self, username: str) -> int:
        return max(0, self.max_attempts - len(self._failures(username)))

    def retry_after(self, username: str) -> int:
        failures = self._failures(username)
        if not failures:
            return 0
        oldest = failures[0].created_at
        if oldest.tzinfo is None:
            oldest = oldest.replace(tzinfo=timezone.utc)
        unlock_at = oldest + timedelta(minutes=self.lockout_minutes)
        seconds = (unlock_at - datetime.now(timezone.utc)).total_seconds()
        return max(1, int(seconds))

    def _cleanup(self) -> None:
        from dagang.extensions import db
        from dagang.models import LoginAttempt

        cutoff = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)
        try:
            db.session.query(LoginAttempt).filter(
                LoginAttempt.created_at < cutoff
            ).delete(synchronize_session=False)
            db.session.commit()
        except Exception:  # pragma: no cover - pembersihan tidak boleh gagalkan login
            db.session.rollback()
