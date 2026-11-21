"""收银员交班：开班点备用金 → 收银 → 交班填实点现金，系统算应有现金和差额。"""
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import get_db, now
from ..models import Order, Payment, Shift, Store, User
from ..security import check_store_access, current_user, has_perm, require
from ..serialize import dt
from ..services.orders import PAY_METHODS

router = APIRouter(prefix="/api", tags=["交班"])


def pay_summary(db: Session, store_id: int, user_id: int, start: datetime, end: datetime | None) -> dict:
    """这个收银员在这个门店、这段时间经手的收款和退款，按收款方式汇总。"""
    cond = [Order.store_id == store_id, Payment.created_by == user_id, Payment.created_at >= start]
    if end:
        cond.append(Payment.created_at <= end)
    rows = db.execute(select(Payment.kind, Payment.method, func.count(), func.sum(Payment.amount))
                      .join(Order, Order.id == Payment.order_id).where(*cond)
                      .group_by(Payment.kind, Payment.method)).all()
    methods = {m: {"method_text": t, "pay_count": 0, "pay": 0, "refund_count": 0, "refund": 0}
               for m, t in PAY_METHODS.items()}
    for kind, method, cnt, amt in rows:
        methods[method][kind + "_count"] += cnt
        methods[method][kind] += int(amt or 0)
    orders = db.scalar(select(func.count(func.distinct(Payment.order_id))).join(Order, Order.id == Payment.order_id)
                       .where(*cond, Payment.kind == "pay")) or 0
    net = sum(v["pay"] - v["refund"] for v in methods.values())
    return {"methods": methods, "orders": orders, "net": net,
            "cash_in": methods["cash"]["pay"] - methods["cash"]["refund"]}


def shift_out(db: Session, s: Shift, users: dict | None = None, stores: dict | None = None) -> dict:
    users = users or {}
    u = users.get(s.user_id) or db.get(User, s.user_id)
    st = stores.get(s.store_id) if stores else db.get(Store, s.store_id)
    if s.status == "open":  # 当班中：实时算到现在
        summ = pay_summary(db, s.store_id, s.user_id, s.started_at, None)
        expected = s.opening_cash + summ["cash_in"]
    else:
        summ, expected = s.summary or {}, s.expected_cash
    return {"id": s.id, "store_id": s.store_id, "store_name": st.name if st else "", "user_id": s.user_id,
            "cashier": (u.display_name or u.username) if u else "", "status": s.status,
            "status_text": "当班中" if s.status == "open" else "已交班",
            "started_at": dt(s.started_at), "ended_at": dt(s.ended_at), "opening_cash": s.opening_cash,
            "expected_cash": expected, "counted_cash": s.counted_cash, "cash_diff": s.cash_diff,
            "orders": summ.get("orders", 0), "net": summ.get("net", 0),
            "methods": summ.get("methods", {}), "remark": s.remark}


class OpenIn(BaseModel):
    store_id: int
    opening_cash: int = Field(0, ge=0)


class CloseIn(BaseModel):
    counted_cash: int = Field(ge=0)
    remark: str = Field("", max_length=200)


def _current(db: Session, store_id: int, user_id: int) -> Shift | None:
    return db.scalar(select(Shift).where(Shift.store_id == store_id, Shift.user_id == user_id,
                                         Shift.status == "open").order_by(Shift.id.desc()))


@router.get("/shifts/current")
def current(store_id: int, db: Session = Depends(get_db), user: User = Depends(require("pos"))):
    check_store_access(user, store_id)
    s = _current(db, store_id, user.id)
    return {"shift": shift_out(db, s) if s else None}


@router.post("/shifts/open")
def open_shift(body: OpenIn, db: Session = Depends(get_db), user: User = Depends(require("pos"))):
    check_store_access(user, body.store_id)
    if not db.get(Store, body.store_id):
        raise HTTPException(404, "门店不存在")
    s = _current(db, body.store_id, user.id)
    if s:  # 重复点开班：返回已开的那一班
        return shift_out(db, s)
    s = Shift(store_id=body.store_id, user_id=user.id, opening_cash=body.opening_cash, started_at=now())
    db.add(s)
    try:
        db.commit()
    except IntegrityError:  # 另一台机器同时开了班（撞上“当班中唯一”索引）：返回那一班
        db.rollback()
        s = _current(db, body.store_id, user.id)
        if not s:
            raise
    return shift_out(db, s)


@router.post("/shifts/{sid}/close")
def close_shift(sid: int, body: CloseIn, db: Session = Depends(get_db), user: User = Depends(require("pos"))):
    s = db.scalar(select(Shift).where(Shift.id == sid).with_for_update(of=Shift))
    if not s:
        raise HTTPException(404, "没有这个班次")
    check_store_access(user, s.store_id)
    if s.user_id != user.id and not has_perm(user, "reports"):
        raise HTTPException(403, "只能交自己的班")
    if s.status != "open":
        return shift_out(db, s)  # 已经交过（网络重试）
    end = now()
    summ = pay_summary(db, s.store_id, s.user_id, s.started_at, end)
    s.ended_at, s.summary, s.status = end, summ, "closed"
    s.expected_cash = s.opening_cash + summ["cash_in"]
    s.counted_cash = body.counted_cash
    s.cash_diff = body.counted_cash - s.expected_cash
    s.remark = body.remark.strip()
    db.commit()
    return shift_out(db, s)


@router.get("/shifts")
def list_shifts(store_id: int | None = None, user_id: int | None = None, begin: date | None = None,
                end: date | None = None, mine: bool = False, export: bool = False,
                db: Session = Depends(get_db), user: User = Depends(current_user)):
    """交班记录。后台（营收权限）看全部；收银员 mine=true 看自己在某门店的。"""
    q = select(Shift)
    if mine or not has_perm(user, "reports"):
        if not has_perm(user, "pos") or not store_id:
            raise HTTPException(403, "没有权限")
        check_store_access(user, store_id)
        q = q.where(Shift.user_id == user.id)
    elif user_id:
        q = q.where(Shift.user_id == user_id)
    if store_id:
        q = q.where(Shift.store_id == store_id)
    if begin:
        q = q.where(Shift.started_at >= datetime.combine(begin, time.min))
    if end:
        q = q.where(Shift.started_at < datetime.combine(end + timedelta(days=1), time.min))
    users = {u.id: u for u in db.scalars(select(User))}
    stores = {s.id: s for s in db.scalars(select(Store))}
    rows = [shift_out(db, s, users, stores) for s in db.scalars(q.order_by(Shift.id.desc()).limit(500))]
    if export:
        from .reports import _xlsx
        y = lambda v: None if v is None else v / 100
        out = [[r["store_name"], r["cashier"], r["started_at"], r["ended_at"] or "当班中", r["orders"],
                *[y(r["methods"].get(m, {}).get("pay", 0) - r["methods"].get(m, {}).get("refund", 0)) for m in PAY_METHODS],
                y(r["net"]), y(r["opening_cash"]), y(r["expected_cash"]), y(r["counted_cash"]), y(r["cash_diff"]), r["remark"]]
               for r in rows]
        header = ["门店", "收银员", "开班", "交班", "单数", *[f"{t}净收" for t in PAY_METHODS.values()], "合计净收",
                  "备用金", "应有现金", "实点现金", "差额（长+ / 短−）", "备注"]
        return _xlsx("交班记录", header, out, f"交班记录_{begin or ''}_{end or ''}")
    return rows
