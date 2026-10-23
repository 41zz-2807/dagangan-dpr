"""Error API terpusat + handler Flask."""

from __future__ import annotations

import logging

from flask import Flask, jsonify, request
from werkzeug.exceptions import HTTPException

logger = logging.getLogger("dagang.api")


class ApiError(Exception):
    """Error yang aman ditampilkan ke client (JSON)."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: object | None = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details

    def to_dict(self) -> dict:
        payload = {"error": {"code": self.code, "message": self.message}}
        if self.details is not None:
            payload["error"]["details"] = self.details
        return payload


def register_error_handlers(app: Flask) -> None:
    @app.errorhandler(ApiError)
    def _handle_api_error(exc: ApiError):
        db_rollback()
        return jsonify(exc.to_dict()), exc.status_code

    @app.errorhandler(HTTPException)
    def _handle_http_error(exc: HTTPException):
        db_rollback()
        if request.path.startswith("/api/"):
            payload = {
                "error": {
                    "code": (exc.name or "http_error").lower().replace(" ", "_"),
                    "message": exc.description or "Permintaan tidak valid",
                }
            }
            return jsonify(payload), exc.code or 500
        return exc

    @app.errorhandler(Exception)
    def _handle_unexpected(exc: Exception):
        db_rollback()
        logger.exception("Kesalahan tak terduga: %s", exc)
        payload = {
            "error": {
                "code": "internal_server_error",
                "message": "Terjadi kesalahan pada server. Silakan coba lagi.",
            }
        }
        return jsonify(payload), 500


def db_rollback() -> None:
    try:
        from dagang.extensions import db

        db.session.rollback()
    except Exception:  # pragma: no cover - session mungkin belum ada
        pass
