"""Konfigurasi logging: console + file rotasi di /data/logs."""

from __future__ import annotations

import logging
import logging.handlers
import os


def setup_logging(app) -> None:
    log_folder = app.config.get("LOG_FOLDER", "/data/logs")
    try:
        os.makedirs(log_folder, exist_ok=True)
    except OSError:
        log_folder = "/tmp"

    root = logging.getLogger()
    root.setLevel(logging.INFO)

    already = any(
        isinstance(h, logging.handlers.RotatingFileHandler) for h in root.handlers
    )
    if not already:
        try:
            file_handler = logging.handlers.RotatingFileHandler(
                os.path.join(log_folder, "app.log"),
                maxBytes=10 * 1024 * 1024,
                backupCount=10,
                encoding="utf-8",
            )
            file_handler.setFormatter(
                logging.Formatter(
                    "%(asctime)s %(levelname)-7s [%(name)s] %(message)s"
                )
            )
            root.addHandler(file_handler)
        except OSError:  # pragma: no cover - filesystem read-only
            pass

    app.logger.setLevel(logging.INFO)
    logging.getLogger("dagang").setLevel(logging.INFO)
