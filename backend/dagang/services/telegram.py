"""Notifikasi Telegram untuk event penting aplikasi."""
import os
import threading
from pathlib import Path

import requests


def _read_info_file():
    for candidate in ("/app/.telegram-info", "/home/warnet/docker/dkie/.telegram-info", ".telegram-info"):
        try:
            path = Path(candidate)
            if path.is_file():
                data = {}
                for line in path.read_text().splitlines():
                    if "=" in line:
                        k, v = line.split("=", 1)
                        data[k.strip()] = v.strip()
                return data
        except Exception:
            continue
    return {}


def _token():
    if os.environ.get("TELEGRAM_BOT_TOKEN"):
        return os.environ.get("TELEGRAM_BOT_TOKEN")
    info = _read_info_file()
    return info.get("TOKEN_BOT")


def _chat_id():
    if os.environ.get("TELEGRAM_CHAT_ID"):
        return os.environ.get("TELEGRAM_CHAT_ID")
    info = _read_info_file()
    return info.get("CHAT_ID")


def send_message(text: str) -> None:
    token = _token()
    chat_id = _chat_id()
    if not token or not chat_id:
        return

    def _worker():
        try:
            requests.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
                timeout=5,
            )
        except Exception:
            pass

    threading.Thread(target=_worker, daemon=True).start()
