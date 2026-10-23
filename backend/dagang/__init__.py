"""Dagang POS - application factory."""

from __future__ import annotations

import os

from flask import Flask, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import safe_join

from dagang.config import build_config
from dagang.extensions import db, jwt, limiter
from dagang.logging_config import setup_logging
from dagang.utils.errors import ApiError, register_error_handlers
from dagang.utils.security_headers import register_security_headers

__version__ = "0.1.0"

# Folder build React (dipasang di /app/static pada image Docker).
STATIC_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static"
)


def create_app(config_object=None) -> Flask:
    app = Flask(__name__, static_folder=STATIC_DIR, static_url_path="/static")
    app.config.from_object(config_object or build_config())
    app.json.sort_keys = False
    app.config["APP_VERSION"] = __version__

    # --- di belakang reverse proxy (cloudflared) -----------------------------
    # x_for/x_proto/x_host/x_port: dignostickan header X-Forwarded-*
    app.wsgi_app = ProxyFix(  # type: ignore[method-assign]
        app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1, x_prefix=0
    )

    setup_logging(app)
    db.init_app(app)
    jwt.init_app(app)
    limiter.init_app(app)

    from dagang.api import register_blueprints

    register_blueprints(app)
    register_error_handlers(app)
    register_security_headers(app)
    _register_spa(app)
    _register_cli(app)

    @app.teardown_appcontext
    def _remove_session(exc):  # pragma: no cover - housekeeping
        db.session.remove()

    return app


def _register_spa(app: Flask) -> None:
    """Sajikan hasil build React sebagai SPA (routing client-side)."""

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def spa(path: str):
        if path.startswith(("api/", "uploads/", "static/")):
            raise ApiError(404, "not_found", "Endpoint tidak ditemukan")
        if path:
            full_path = safe_join(app.static_folder, path)
            if full_path and os.path.isfile(full_path):
                response = send_from_directory(app.static_folder, path)
                # service worker & manifest harus selalu dicek server supaya
                # update PWA langsung berlaku (tidak tertahan cache proxy).
                if path in {"sw.js", "manifest.webmanifest"}:
                    response.headers["Cache-Control"] = "no-cache"
                return response
        index_file = os.path.join(app.static_folder, "index.html")
        if not os.path.isfile(index_file):
            return (
                jsonify(
                    {
                        "error": {
                            "code": "frontend_not_built",
                            "message": "Frontend belum dibangun. Jalankan `npm run build` di folder frontend.",
                        }
                    }
                ),
                503,
            )
        return send_from_directory(app.static_folder, "index.html")


def _register_cli(app: Flask) -> None:
    from dagang.cli import register_cli

    register_cli(app)


def create_app_from_env() -> Flask:  # pragma: no cover - helper
    return create_app()


__all__ = ["create_app", "db", "jsonify", "request"]
