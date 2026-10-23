"""Pemrosesan gambar produk (Pillow): validasi, kompres, thumbnail."""

from __future__ import annotations

import io
import os
import re
import secrets
import shutil
from datetime import datetime, timezone

from flask import current_app
from PIL import Image, ImageOps
from werkzeug.utils import secure_filename

from dagang.utils.errors import ApiError

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_MIMETYPES = {"image/jpeg", "image/png", "image/webp", "image/jpg"}

MAX_MEDIUM_SIZE = (1024, 1024)
MAX_THUMB_SIZE = (320, 320)
JPEG_QUALITY = 85
THUMB_QUALITY = 80

# Nama file yang dibuat server: 32 hex + ekstensi (aman, tidak bisa ditebak dari input user)
GENERATED_NAME = re.compile(r"^[0-9a-f]{32}(_thumb)?\.(jpg|jpeg|png|webp)$")


def upload_folder() -> str:
    return current_app.config.get("UPLOAD_FOLDER", "/data/uploads")


def _ensure_folder() -> str:
    folder = upload_folder()
    os.makedirs(folder, exist_ok=True)
    return folder


def _target_dir() -> str:
    """Subfolder per bulan agar folder upload tidak menumpuk: 2026/10."""
    now = datetime.now(timezone.utc)
    sub = os.path.join(str(now.year), f"{now.month:02d}")
    path = os.path.join(_ensure_folder(), sub)
    os.makedirs(path, exist_ok=True)
    return path


def _relative(base: str, path: str) -> str:
    return os.path.relpath(path, base).replace(os.sep, "/")


def save_product_image(file_storage) -> dict:
    """Simpan gambar produk -> versi sedang (max 1024px) + thumbnail (max 320px).

    Mengembalikan dict berisi path relatif, url, dan ukuran file.
    """
    if file_storage is None or not file_storage.filename:
        raise ApiError(400, "file_missing", "File gambar wajib diunggah.")

    original_name = secure_filename(file_storage.filename or "")
    extension = os.path.splitext(original_name)[1].lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise ApiError(
            400,
            "invalid_file_type",
            "Format gambar harus JPG, PNG, atau WEBP.",
        )

    mimetype = (file_storage.mimetype or "").lower()
    if mimetype and mimetype not in ALLOWED_MIMETYPES:
        raise ApiError(400, "invalid_file_type", "Format gambar harus JPG, PNG, atau WEBP.")

    data = file_storage.read()
    if not data:
        raise ApiError(400, "file_empty", "File gambar kosong.")
    max_bytes = int(current_app.config.get("MAX_UPLOAD_MB", 8)) * 1024 * 1024
    if len(data) > max_bytes:
        raise ApiError(
            413,
            "file_too_large",
            f"Ukuran gambar maksimal {int(current_app.config.get('MAX_UPLOAD_MB', 8))} MB.",
        )

    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except Exception:
        raise ApiError(400, "invalid_image", "Berkas bukan gambar yang valid.")

    if image.width * image.height > 40_000_000:
        raise ApiError(400, "image_too_large", "Resolusi gambar terlalu besar.")

    image = ImageOps.exif_transpose(image)
    image = _to_rgb(image)

    base = upload_folder()
    target = _target_dir()
    token = secrets.token_hex(16)
    medium_name = f"{token}.jpg"
    thumb_name = f"{token}_thumb.jpg"

    medium_path = os.path.join(target, medium_name)
    thumb_path = os.path.join(target, thumb_name)

    medium = image.copy()
    medium.thumbnail(MAX_MEDIUM_SIZE, Image.LANCZOS)
    medium.save(medium_path, "JPEG", quality=JPEG_QUALITY, optimize=True)

    thumb = image.copy()
    thumb.thumbnail(MAX_THUMB_SIZE, Image.LANCZOS)
    thumb.save(thumb_path, "JPEG", quality=THUMB_QUALITY, optimize=True)

    return {
        "image_path": _relative(base, medium_path),
        "thumb_path": _relative(base, thumb_path),
        "url": f"/api/uploads/{_relative(base, medium_path)}",
        "thumb_url": f"/api/uploads/{_relative(base, thumb_path)}",
        "width": medium.width,
        "height": medium.height,
        "size_bytes": os.path.getsize(medium_path),
    }


def _to_rgb(image: Image.Image) -> Image.Image:
    if image.mode in {"RGBA", "LA"} or (image.mode == "P" and "transparency" in image.info):
        image = image.convert("RGBA")
        background = Image.new("RGB", image.size, (255, 255, 255))
        background.paste(image, mask=image.split()[-1])
        return background
    if image.mode == "RGB":
        return image
    return image.convert("RGB")


def delete_image(relative_path: str | None) -> None:
    """Hapus file gambar (dan thumbnail pasangannya) bila ada."""
    if not relative_path:
        return
    base = os.path.abspath(upload_folder())
    path = os.path.abspath(os.path.join(base, relative_path))
    if not path.startswith(base + os.sep):
        return
    try:
        if os.path.isfile(path):
            os.remove(path)
    except OSError:
        pass
    # hapus thumbnail pasangan
    root, ext = os.path.splitext(path)
    thumb = f"{root}_thumb{ext}"
    try:
        if os.path.isfile(thumb):
            os.remove(thumb)
    except OSError:
        pass


def resolve_upload_path(relative_path: str) -> str:
    """Ambil path absolut yang aman di dalam folder upload."""
    base = os.path.abspath(upload_folder())
    relative_path = (relative_path or "").strip().lstrip("/")
    path = os.path.abspath(os.path.join(base, relative_path))
    if not path.startswith(base + os.sep):
        raise ApiError(404, "not_found", "Gambar tidak ditemukan.")
    if not GENERATED_NAME.match(os.path.basename(path)):
        raise ApiError(404, "not_found", "Gambar tidak ditemukan.")
    if not os.path.isfile(path):
        raise ApiError(404, "not_found", "Gambar tidak ditemukan.")
    return path


def clear_folder(folder: str) -> None:  # pragma: no cover - utilitas maintenance
    shutil.rmtree(folder, ignore_errors=True)
