"""Blueprint API: Shift Kasir."""

from __future__ import annotations

from datetime import datetime, time, timedelta
from decimal import Decimal

from flask import Blueprint, jsonify, request
from sqlalchemy import func

from dagang.extensions import db
from dagang.models import Payment, Sale, Shift, ShiftTransaction, User
from dagang.utils.decorators import load_current_user, roles_required
from dagang.utils.errors import ApiError

bp = Blueprint("shifts", __name__, url_prefix="/api/shifts")


@bp.get("/current")
@roles_required(User.ROLE_OWNER, User.ROLE_KASIR)
def current_shift():
    user = load_current_user()
    shift = db.session.query(Shift).filter_by(cashier_id=user.id, status="open").first()
    if not shift:
        return jsonify({"shift": None})
    return jsonify({"shift": shift.to_dict()})


@bp.post("/open")
@roles_required(User.ROLE_OWNER, User.ROLE_KASIR)
def open_shift():
    user = load_current_user()
    existing = db.session.query(Shift).filter_by(cashier_id=user.id, status="open").first()
    if existing:
        raise ApiError(409, "shift_open", "Masih ada shift yang belum ditutup.")

    data = request.get_json(silent=True) or {}
    try:
        opening_balance = Decimal(str(data.get("opening_balance") or 0))
    except Exception:
        raise ApiError(400, "invalid_amount", "Saldo awal tidak valid.")
    if opening_balance < 0:
        raise ApiError(422, "invalid_amount", "Saldo awal tidak boleh negatif.")

    shift = Shift(cashier_id=user.id, opening_balance=opening_balance, status="open")
    db.session.add(shift)
    db.session.commit()
    return jsonify({"shift": shift.to_dict()}), 201


@bp.post("/close")
@roles_required(User.ROLE_OWNER, User.ROLE_KASIR)
def close_shift():
    user = load_current_user()
    shift = db.session.query(Shift).filter_by(cashier_id=user.id, status="open").first()
    if not shift:
        raise ApiError(404, "no_shift", "Tidak ada shift aktif untuk ditutup.")

    data = request.get_json(silent=True) or {}
    try:
        cash_in_drawer = Decimal(str(data.get("cash_in_drawer") or 0))
    except Exception:
        raise ApiError(400, "invalid_amount", "Uang fisik tidak valid.")

    notes = (data.get("notes") or "").strip() or None

    if cash_in_drawer < 0:
        raise ApiError(422, "invalid_amount", "Uang fisik tidak boleh negatif.")

    closed_at = datetime.now()

    # Penjualan tunai netto = uang yang benar-benar tinggal di laci.
    # Payment.amount adalah uang diterima; change_amount adalah kembalian.
    cash_sales = (
        db.session.query(
            func.coalesce(func.sum(Payment.amount - Payment.change_amount), 0)
        )
        .join(Payment.sale)
        .filter(
            Sale.cashier_id == user.id,
            Sale.status == Sale.STATUS_PAID,
            Sale.voided_at.is_(None),
            Sale.created_at >= shift.opened_at,
            Sale.created_at <= closed_at,
            Payment.method == Payment.METHOD_CASH,
        )
        .scalar()
    )
    cash_sales = Decimal(str(cash_sales or 0))
    expected_cash = Decimal(str(shift.opening_balance or 0)) + cash_sales
    difference = cash_in_drawer - expected_cash

    shift.cash_sales = cash_sales
    shift.cash_in_drawer = cash_in_drawer
    shift.difference = difference
    shift.closing_balance = cash_in_drawer
    shift.notes = notes
    shift.status = "closed"
    shift.closed_at = closed_at

    db.session.commit()
    return jsonify({"shift": shift.to_dict()})


@bp.get("/history")
@roles_required(User.ROLE_OWNER, User.ROLE_KASIR)
def history():
    user = load_current_user()
    query = db.session.query(Shift).order_by(Shift.opened_at.desc())
    if user.role != User.ROLE_OWNER:
        query = query.filter(Shift.cashier_id == user.id)
    shifts = query.limit(100).all()
    return jsonify({"items": [s.to_dict() for s in shifts]})


@bp.get("/<int:shift_id>")
@roles_required(User.ROLE_OWNER, User.ROLE_KASIR)
def shift_detail(shift_id: int):
    user = load_current_user()
    shift = db.session.query(Shift).filter_by(id=shift_id).first()
    if not shift:
        raise ApiError(404, "not_found", "Shift tidak ditemukan.")
    if user.role != User.ROLE_OWNER and shift.cashier_id != user.id:
        raise ApiError(403, "forbidden", "Tidak diizinkan.")
    return jsonify({"shift": shift.to_dict(include_details=True)})
