"""Helper cookie JWT (httpOnly + SameSite + Secure adaptif)."""

from __future__ import annotations

from flask import Response, current_app, request


def cookie_secure_mode() -> str:
    return str(current_app.config.get("COOKIE_SECURE_MODE", "auto")).strip().lower()


def desired_secure() -> bool:
    """auto -> mengikuti skema request (https=Secure, http lokal=tanpa Secure)."""
    mode = cookie_secure_mode()
    if mode in {"1", "true", "yes", "on"}:
        return True
    if mode in {"0", "false", "no", "off"}:
        return False
    return bool(request.is_secure)


def _rewrite_secure_attribute(response: Response) -> None:
    headers = response.headers.getlist("Set-Cookie")
    if not headers:
        return
    want_secure = desired_secure()
    response.headers.remove("Set-Cookie")
    for raw in headers:
        parts = [part.strip() for part in raw.split(";")]
        name_value, attrs = parts[0], parts[1:]
        has_secure = any(attr.lower() == "secure" for attr in attrs)
        if want_secure and not has_secure:
            attrs.append("Secure")
        elif not want_secure and has_secure:
            attrs = [attr for attr in attrs if attr.lower() != "secure"]
        response.headers.add("Set-Cookie", "; ".join([name_value, *attrs]))


def issue_auth_cookies(
    response: Response,
    access_token: str | None = None,
    refresh_token: str | None = None,
    max_age: int | None = None,
    refresh_max_age: int | None = None,
) -> Response:
    from flask_jwt_extended import set_access_cookies, set_refresh_cookies

    if access_token is not None:
        set_access_cookies(response, access_token, max_age=max_age)
    if refresh_token is not None:
        set_refresh_cookies(response, refresh_token, max_age=refresh_max_age)
    _rewrite_secure_attribute(response)
    return response


def clear_auth_cookies(response: Response) -> Response:
    from flask_jwt_extended import unset_jwt_cookies

    unset_jwt_cookies(response)
    _rewrite_secure_attribute(response)
    return response
