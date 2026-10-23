"""Blueprint API: upload & penyajian gambar produk."""

from __future__ import annotations

import mimetypes
import os

from flask import Blueprint, current_app, jsonify, request, send_file

from dagang.models import User
from dagang.services.audit import record
from dagang.services.image import resolve_upload_path, save_product_image
from dagang.utils.decorators import load_current_user, roles_required
from dagang.utils.errors import ApiError

bp = Blueprint("uploads", __name__, url_prefix="/api/uploads")


@bp.post("/product-image")
@roles_required(User.ROLE_OWNER)
def upload_image():
    """Unggah gambar (standalone, sebelum produk dibuat)."""
    user = load_current_user()
    file_storage = request.files.get("file")
    result = save_product_image(file_storage)

    record(
        "upload.product_image",
        user=user,
        entity="products",
        entity_id=None,
        after={
            "image_path": result["image_path"],
            "size_bytes": result["size_bytes"],
        },
    )
    return jsonify({"image": result}), 201


@bp.get("/<path:filename>")
def serve_image(filename: str):
    """Sajikan file gambar (terkontrol: hanya di dalam folder upload)."""
    path = resolve_upload_path(filename)
    mimetype, _ = mimetypes.guess_type(path)
    response = send_file(path, mimetype=mimetype or "application/octet-stream")
    response.headers["Cache-Control"] = "public, max-age=604800"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response
