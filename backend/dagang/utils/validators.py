"""Validasi input berbasis pydantic."""

from __future__ import annotations

from typing import Type, TypeVar

from flask import request
from pydantic import BaseModel, ValidationError

from dagang.utils.errors import ApiError

T = TypeVar("T", bound=BaseModel)


def parse_body(model_cls: Type[T]) -> T:
    """Parse & validasi JSON body terhadap schema pydantic."""
    payload = request.get_json(silent=True)
    if payload is None:
        raise ApiError(400, "invalid_body", "Body permintaan harus berupa JSON")
    if not isinstance(payload, dict):
        raise ApiError(400, "invalid_body", "Body permintaan harus berupa objek JSON")
    try:
        return model_cls.model_validate(payload)
    except ValidationError as exc:
        details = [
            {
                "field": ".".join(str(p) for p in err.get("loc", ())),
                "message": err.get("msg", "tidak valid"),
            }
            for err in exc.errors()
        ]
        raise ApiError(422, "validation_error", "Data yang dikirim tidak valid", details)


def parse_query_bool(value: str | None) -> bool | None:
    if value is None or value == "":
        return None
    return value.strip().lower() in {"1", "true", "yes", "on"}
