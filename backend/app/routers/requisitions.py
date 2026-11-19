"""门店要货申请：门店提申请，仓库照单（可改数量）调拨到门店。"""
import uuid
from collections import defaultdict
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..services.orders import once, same_request
from ..db import get_db, now
from ..models import Location, Requisition, RequisitionLine, StockDoc, StockItem, Store, User
from ..security import check_store_access, current_user, has_perm, require
from ..serialize import dt, num
from ..services import inventory as inv

router = APIRouter(prefix="/api", tags=["要货申请"])
STATUS_TEXT = {"pending": "待处理", "done": "已调拨", "rejected": "已驳回", "cancelled": "已撤回"}


class ReqLineIn(BaseModel):
    stock_item_id: int
    qty: float = Field(gt=0)


class ReqIn(BaseModel):
    remark: str = Field("", max_length=200)
    request_id: str | None = None
    lines: list[ReqLineIn] = Field(min_length=1)


class FulfillLineIn(BaseModel):
    stock_item_id: int
    qty: float = Field(ge=0)


class FulfillIn(BaseModel):
    from_location_id: int
    note: str = Field("", max_length=200)
    request_id: str | None = None
    lines: list[FulfillLineIn]


class RejectIn(BaseModel):
    reason: str = Field(min_length=1, max_length=200)


def _out(db: Session, r: Requisition, ctx: dict | None = None) -> dict:
    if ctx is None:
        ctx = {"names": {i.id: (i.name, i.unit) for i in db.scalars(select(StockItem))},
               "users": {u.id: (u.display_name or u.username) for u in db.scalars(select(User))},
               "stores": {s.id: s.name for s in db.scalars(select(Store))}}
    doc = db.get(StockDoc, r.transfer_doc_id) if r.transfer_doc_id else None
    return {"id": r.id, "no": r.no, "store_id": r.store_id, "store_name": ctx["stores"].get(r.store_id, ""),
            "status": r.status, "status_text": STATUS_TEXT[r.status], "remark": r.remark,
            "created_at": dt(r.created_at), "created_by_name": ctx["users"].get(r.created_by, ""),
            "handled_at": dt(r.handled_at), "handled_by_name": ctx["users"].get(r.handled_by, ""),
            "handle_note": r.handle_note, "transfer_doc_no": doc.no if doc else None,
            "lines": [{"stock_item_id": ln.stock_item_id, "name": ctx["names"].get(ln.stock_item_id, ("", ""))[0],
                       "unit": ctx["names"].get(ln.stock_item_id, ("", ""))[1], "qty": num(ln.qty),
                       "sent_qty": None if ln.sent_qty is None else num(ln.sent_qty)} for ln in r.lines]}


def _staff_check(db: Session, user: User, store_id: int) -> Store:
    store = db.get(Store, store_id)
    if not store:
        raise HTTPException(404, "门店不存在")
    if not (has_perm(user, "requisition") or has_perm(user, "inventory")):
        raise HTTPException(403, "没有权限：要货申请")
    check_store_access(user, store_id)
    return store


@router.post("/stores/{sid}/requisitions")
def create(sid: int, body: ReqIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    _staff_check(db, user, sid)

    def run():
        if body.request_id:
            exist = db.scalar(select(Requisition).where(Requisition.request_id == body.request_id))
            if exist:
                same_request(exist.store_id == sid and exist.created_by == user.id)
                return exist
        qty: dict[int, Decimal] = defaultdict(Decimal)
        for ln in body.lines:
            item = db.get(StockItem, ln.stock_item_id)
            if not item or not item.active:
                raise HTTPException(400, "库存品不存在或已停用")
            qty[ln.stock_item_id] += Decimal(str(ln.qty))
        r = Requisition(no=f"YH{now():%Y%m%d%H%M%S}{uuid.uuid4().hex[:4].upper()}", store_id=sid,
                        remark=body.remark.strip(), created_by=user.id, request_id=body.request_id)
        db.add(r)
        db.flush()
        for sid_, q in qty.items():
            db.add(RequisitionLine(requisition_id=r.id, stock_item_id=sid_, qty=q))
        return r
    r = once(db, run)
    db.refresh(r)
    return _out(db, r)


@router.get("/requisitions")
def list_reqs(store_id: int | None = None, status: str | None = None, page: int = 1, size: int = 50,
              db: Session = Depends(get_db), user: User = Depends(current_user)):
    """后台（库存权限）看全部门店；门店员工必须指定自己的门店。"""
    q = select(Requisition)
    if has_perm(user, "inventory"):
        if store_id:
            q = q.where(Requisition.store_id == store_id)
    else:
        if not store_id:
            raise HTTPException(400, "请选择门店")
        _staff_check(db, user, store_id)
        q = q.where(Requisition.store_id == store_id)
    if status:
        q = q.where(Requisition.status == status)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    size = max(1, min(size, 200))
    rows = db.scalars(q.order_by(Requisition.id.desc()).offset((max(page, 1) - 1) * size).limit(size)).all()
    ctx = {"names": {i.id: (i.name, i.unit) for i in db.scalars(select(StockItem))},
           "users": {u.id: (u.display_name or u.username) for u in db.scalars(select(User))},
           "stores": {s.id: s.name for s in db.scalars(select(Store))}}
    return {"total": total, "items": [_out(db, r, ctx) for r in rows]}


def _get_pending(db: Session, rid: int) -> Requisition:
    r = db.scalar(select(Requisition).where(Requisition.id == rid).with_for_update(of=Requisition))
    if not r:
        raise HTTPException(404, "要货单不存在")
    if r.status != "pending":
        raise HTTPException(409, f"这张要货单{STATUS_TEXT[r.status]}，不能再处理")
    return r


@router.post("/requisitions/{rid}/cancel")
def cancel(rid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    r = db.get(Requisition, rid)
    if not r:
        raise HTTPException(404, "要货单不存在")
    _staff_check(db, user, r.store_id)
    r = _get_pending(db, rid)
    r.status, r.handled_by, r.handled_at = "cancelled", user.id, now()
    db.commit()
    return _out(db, r)


@router.post("/requisitions/{rid}/reject")
def reject(rid: int, body: RejectIn, db: Session = Depends(get_db), user: User = Depends(require("inventory"))):
    r = _get_pending(db, rid)
    r.status, r.handled_by, r.handled_at, r.handle_note = "rejected", user.id, now(), body.reason.strip()
    db.commit()
    return _out(db, r)


@router.post("/requisitions/{rid}/fulfill")
def fulfill(rid: int, body: FulfillIn, db: Session = Depends(get_db), user: User = Depends(require("inventory"))):
    """照单调拨：从仓库调到要货门店，数量可以改（0 表示这项不发）。生成一张调拨单。"""
    def already_done():
        if body.request_id:
            done = db.scalar(select(Requisition).where(Requisition.id == rid))
            if done and done.status == "done" and done.transfer_doc_id:
                d = db.get(StockDoc, done.transfer_doc_id)
                if d and d.request_id == body.request_id:
                    return done
    if (done := already_done()):
        return _out(db, done)
    try:
        r = _get_pending(db, rid)
    except HTTPException:
        # 双击“发货”：前一次刚在锁里发完，这一次等到锁后看到已发货，返回同一结果而不是报错
        db.expire_all()
        if (done := already_done()):
            return _out(db, done)
        raise
    src = db.get(Location, body.from_location_id)
    if not src:
        raise HTTPException(400, "调出地点不存在")
    store = db.get(Store, r.store_id)
    send: dict[int, Decimal] = defaultdict(Decimal)
    for ln in body.lines:
        send[ln.stock_item_id] += Decimal(str(ln.qty))
    lines = [{"stock_item_id": k, "qty": v} for k, v in send.items() if v > 0]
    if not lines:
        raise HTTPException(400, "调拨数量都为 0。如果不发货，请点“驳回”")
    note = body.note.strip()
    doc = inv.create_doc(db, kind="transfer", lines=lines, user_id=user.id, from_location_id=src.id,
                         to_location_id=store.location_id, request_id=body.request_id,
                         remark=f"要货单 {r.no}" + (f"：{note}" if note else ""))
    asked = {ln.stock_item_id for ln in r.lines}
    for ln in r.lines:
        ln.sent_qty = send.get(ln.stock_item_id, Decimal(0))
    for k, v in send.items():  # 仓库额外加发的库存品也记上
        if k not in asked and v > 0:
            db.add(RequisitionLine(requisition_id=r.id, stock_item_id=k, qty=Decimal(0), sent_qty=v))
    r.status, r.handled_by, r.handled_at, r.handle_note = "done", user.id, now(), note
    r.transfer_doc_id = doc.id
    db.commit()
    db.refresh(r)
    return _out(db, r)
