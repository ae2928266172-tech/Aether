"""门店工作台：收银、订单处理、退货退款、小票打印。"""
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db, now
from ..models import Order, Refund, Store, User
from ..security import check_store_access, current_user, has_perm, require
from ..serialize import order_out, refund_out
from ..services import orders as svc
from ..services.receipt import build_receipt

router = APIRouter(prefix="/api", tags=["收银与订单"])


class LineIn(BaseModel):
    sku_id: int
    qty: int = Field(gt=0)


class PayIn(BaseModel):
    method: str
    amount: int
    received: int | None = None


class CheckoutIn(BaseModel):
    store_id: int
    lines: list[LineIn]
    payments: list[PayIn]
    discount_rate: int | None = None
    payable: int | None = None
    remark: str = ""
    request_id: str | None = None


class QuoteIn(BaseModel):
    lines: list[LineIn]
    discount_rate: int | None = None
    payable: int | None = None


@router.post("/pos/quote")
def quote(body: QuoteIn, db: Session = Depends(get_db), user: User = Depends(require("pos"))):
    """试算：返回原价、折后、应收，不落库。"""
    o = Order()
    o.items = svc.build_items(db, [l.model_dump() for l in body.lines], online=False)
    svc.apply_pricing(o, user, body.discount_rate, body.payable)
    out = {"original_amount": o.original_amount, "payable_amount": o.payable_amount,
           "discount_amount": o.original_amount - o.payable_amount, "discount_rate": o.discount_rate}
    db.rollback()
    return out


@router.post("/pos/checkout")
def checkout(body: CheckoutIn, db: Session = Depends(get_db), user: User = Depends(require("pos"))):
    check_store_access(user, body.store_id)
    store = db.get(Store, body.store_id)
    if not store or not store.active:
        raise HTTPException(400, "门店不存在或已停用")
    o = svc.once(db, lambda: svc.pos_checkout(
        db, user, db.get(Store, body.store_id), [l.model_dump() for l in body.lines], [p.model_dump() for p in body.payments],
        body.discount_rate, body.payable, body.remark, body.request_id))
    return order_out(o)


def _load(db: Session, oid: int, user: User, lock: bool = False) -> Order:
    o = svc.get_order(db, oid, lock=lock)
    check_store_access(user, o.store_id)
    return o


def _can_see_orders(user: User):
    if not (has_perm(user, "orders") or has_perm(user, "pos") or has_perm(user, "reports")):
        raise HTTPException(403, "没有订单权限")


@router.get("/orders")
def list_orders(store_id: int | None = None, status: str | None = None, source: str | None = None,
                pay_status: str | None = None, begin: date | None = None, end: date | None = None,
                keyword: str = "", area_id: int | None = None, page: int = 1, size: int = 50,
                db: Session = Depends(get_db), user: User = Depends(current_user)):
    _can_see_orders(user)
    q = select(Order)
    if store_id:
        check_store_access(user, store_id)
        q = q.where(Order.store_id == store_id)
    elif not user.role.is_admin:
        q = q.where(Order.store_id.in_([s.id for s in user.stores]))
    if source:
        q = q.where(Order.source == source)
    if area_id:
        q = q.where(Order.area_id == area_id)
    if begin:
        q = q.where(Order.created_at >= datetime.combine(begin, time.min))
    if end:
        q = q.where(Order.created_at < datetime.combine(end + timedelta(days=1), time.min))
    if keyword:
        q = q.where(Order.no.contains(keyword) | Order.location_note.contains(keyword)
                    | Order.contact_phone.contains(keyword))
    # 各状态数量（不受状态筛选影响，用于页面上的快捷筛选）
    base = q.subquery()
    counts = {"all": 0, "pending": 0, "unpaid": 0, "completed": 0, "cancelled": 0, "refund": 0}
    for st, ps, n in db.execute(select(base.c.status, base.c.pay_status, func.count()).group_by(base.c.status, base.c.pay_status)):
        counts["all"] += n
        if st == "pending":
            counts["pending"] += n
        if st == "accepted" and ps == "unpaid":
            counts["unpaid"] += n
        if st == "completed":
            counts["completed"] += n
        if st == "cancelled":
            counts["cancelled"] += n
        if ps in ("partial_refunded", "refunded"):
            counts["refund"] += n
    if status:
        q = q.where(Order.status.in_(status.split(",")))
    if pay_status:
        q = q.where(Order.pay_status.in_(pay_status.split(",")))
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    sum_payable = db.scalar(select(func.coalesce(func.sum(q.subquery().c.payable_amount), 0)))
    size = max(1, min(size, 200))
    rows = db.scalars(q.order_by(Order.id.desc()).offset((page - 1) * size).limit(size)).all()
    return {"total": total, "counts": counts, "sum_payable": int(sum_payable or 0),
            "items": [order_out(o, detail=True) for o in rows]}


@router.get("/orders/new")
def new_orders(store_id: int, after_id: int = 0, db: Session = Depends(get_db), user: User = Depends(require("orders"))):
    """门店工作台轮询：返回 after_id 之后到达的小程序订单，用于提示音和自动打印。"""
    check_store_access(user, store_id)
    rows = db.scalars(select(Order).where(Order.store_id == store_id, Order.source == "online",
                                          Order.id > after_id).order_by(Order.id)).all()
    pending = db.scalar(select(func.count()).where(Order.store_id == store_id, Order.status == "pending"))
    last = db.scalar(select(func.max(Order.id)).where(Order.store_id == store_id)) or 0
    return {"orders": [order_out(o) for o in rows], "pending_count": pending, "last_id": max(last, after_id)}


@router.get("/orders/{oid}")
def get_order(oid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    _can_see_orders(user)
    o = _load(db, oid, user)
    d = order_out(o)
    d["refunds"] = [refund_out(r) for r in db.scalars(select(Refund).where(Refund.order_id == o.id))]
    from ..models import Exchange
    d["exchanges"] = [exchange_out(x) for x in db.scalars(select(Exchange).where(Exchange.order_id == o.id).order_by(Exchange.id))]
    from ..models import OrderLog
    d["logs"] = [{"action": l.action, "detail": l.detail, "created_at": l.created_at.strftime("%Y-%m-%d %H:%M:%S")}
                 for l in db.scalars(select(OrderLog).where(OrderLog.order_id == o.id).order_by(OrderLog.id))]
    return d


@router.post("/orders/{oid}/accept")
def accept(oid: int, db: Session = Depends(get_db), user: User = Depends(require("orders"))):
    o = _load(db, oid, user, lock=True)
    svc.accept(db, o, user)
    db.commit()
    return order_out(o)


class CollectIn(BaseModel):
    payments: list[PayIn]
    discount_rate: int | None = None
    payable: int | None = None
    request_id: str | None = None


@router.post("/orders/{oid}/collect")
def collect(oid: int, body: CollectIn, db: Session = Depends(get_db), user: User = Depends(require("orders"))):
    o = _load(db, oid, user, lock=True)
    if body.request_id and o.collect_request_id == body.request_id and o.pay_status != "unpaid":
        # 上一次其实已经收款成功（网络抖动导致前端没拿到响应），同一个请求号重发直接返回原单
        return order_out(o)
    svc.collect(db, o, user, [p.model_dump() for p in body.payments], body.discount_rate, body.payable, body.request_id)
    db.commit()
    return order_out(o)


class CancelIn(BaseModel):
    reason: str = ""


@router.post("/orders/{oid}/cancel")
def cancel(oid: int, body: CancelIn, db: Session = Depends(get_db), user: User = Depends(require("orders"))):
    o = _load(db, oid, user, lock=True)
    svc.cancel(db, o, user, body.reason)
    db.commit()
    return order_out(o)


class ModifyIn(BaseModel):
    lines: list[LineIn]
    reason: str = ""


@router.post("/orders/{oid}/modify")
def modify(oid: int, body: ModifyIn, db: Session = Depends(get_db), user: User = Depends(require("orders"))):
    o = _load(db, oid, user, lock=True)
    svc.modify(db, o, user, [l.model_dump() for l in body.lines], body.reason)
    db.commit()
    db.refresh(o)
    return order_out(o)


class ExReturnIn(BaseModel):
    order_item_id: int
    qty: int = Field(gt=0)


class ExItemIn(BaseModel):
    sku_id: int
    qty: int = Field(gt=0)


class ExchangeIn(BaseModel):
    returns: list[ExReturnIn]
    items: list[ExItemIn]
    new_amount: int | None = None  # 换出商品成交金额（分），不填按现价
    condition: str = "good"  # good 完好回可售库存 / defective 拆封破损进残次品库
    method: str | None = None
    reason: str = ""
    request_id: str | None = None
    escpos: bool = False


def exchange_out(ex) -> dict:
    return {"id": ex.id, "no": ex.no, "order_id": ex.order_id, "old_amount": ex.old_amount,
            "new_original": ex.new_original, "new_amount": ex.new_amount, "diff": ex.diff, "method": ex.method,
            "condition": ex.condition, "reason": ex.reason, "created_at": ex.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            "print_count": ex.print_count}


def _exchange_receipt(db: Session, ex, user: User, reprint: bool, escpos: bool) -> dict:
    from ..services.receipt import build_exchange_receipt
    ex.print_count += 1
    r = build_exchange_receipt(db, ex, user, reprint=reprint)
    if escpos:
        import base64
        from ..services import escpos as esc
        r = {**r, "escpos": base64.b64encode(esc.build(r)).decode()}
    return r


@router.post("/orders/{oid}/exchange/quote")
def exchange_quote(oid: int, body: ExchangeIn, db: Session = Depends(get_db), user: User = Depends(require("orders"))):
    """换货前先算：退回商品按原实收、换出商品按现价（或调低后的金额），差价多退少补。不改数据。"""
    return svc.exchange_quote(db, _load(db, oid, user), user, [r.model_dump() for r in body.returns],
                              [i.model_dump() for i in body.items], body.new_amount)


@router.post("/orders/{oid}/exchange")
def exchange(oid: int, body: ExchangeIn, db: Session = Depends(get_db), user: User = Depends(require("orders"))):
    """售后换货：可跨商品、部分换、一换多；必须带 request_id，重复提交返回第一次的结果。"""
    ex = svc.once(db, lambda: svc.exchange(
        db, _load(db, oid, user, lock=True), user, [r.model_dump() for r in body.returns],
        [i.model_dump() for i in body.items], body.condition, body.method, body.new_amount, body.reason,
        body.request_id))
    o = _load(db, oid, user)
    db.refresh(o)
    out = {"exchange": exchange_out(ex), "order": order_out(o)}
    if o.store.print_mode == "agent":
        out["receipt"] = {"queued": True, "order_no": o.no}
    elif ex.print_count == 0:  # 换货凭证：浏览器 / 桌面软件直接打印（重试的请求不再重复出票）
        out["receipt"] = _exchange_receipt(db, ex, user, False, body.escpos)
        db.commit()
    return out


class RefundLineIn(BaseModel):
    order_item_id: int
    qty: int


class RefundIn(BaseModel):
    lines: list[RefundLineIn]
    restock: bool = True
    method: str | None = None
    reason: str = ""
    amount: int | None = None
    request_id: str | None = None


@router.post("/orders/{oid}/refund")
def refund(oid: int, body: RefundIn, db: Session = Depends(get_db), user: User = Depends(require("refund"))):
    rf = svc.once(db, lambda: svc.refund(
        db, _load(db, oid, user, lock=True), user, [l.model_dump() for l in body.lines], body.restock, body.method,
        body.reason, body.amount, body.request_id))
    o = _load(db, oid, user)
    db.refresh(o)
    return {"refund": refund_out(rf), "order": order_out(o)}


class PrintIn(BaseModel):
    reprint: bool = False
    escpos: bool = False  # 桌面收银软件：同时返回 ESC/POS 指令（base64），由软件直接发给本机小票机


@router.post("/orders/{oid}/print")
def print_receipt(oid: int, body: PrintIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """取小票内容。首次自动打印需要收银或订单权限；补打需要补打权限。小票内容始终来自该订单本身。"""
    o = _load(db, oid, user, lock=True)
    if body.reprint or o.print_count > 0:
        if not has_perm(user, "reprint"):
            raise HTTPException(403, "没有补打小票权限")
    elif not (has_perm(user, "pos") or has_perm(user, "orders")):
        raise HTTPException(403, "没有打印权限")
    if o.store.print_mode == "agent":
        # 小票机接在别的电脑上：放进打印队列，由打印小助手取走打印（计数和日志在出票时记）
        from ..services.printq import enqueue
        enqueue(db, o.store, o, "reprint" if (body.reprint or o.print_count > 0) else "pos", user)
        db.commit()
        return {"queued": True, "order_no": o.no}
    o.print_count += 1
    svc.log(db, o, "补打小票" if o.print_count > 1 else "打印小票", "", user)
    receipt = build_receipt(db, o, user, reprint=o.print_count > 1)
    db.commit()
    if body.escpos:
        import base64
        from ..services import escpos
        receipt = {**receipt, "escpos": base64.b64encode(escpos.build(receipt)).decode()}
    return receipt


@router.get("/pos/summary")
def shift_summary(store_id: int, day: date | None = None, db: Session = Depends(get_db),
                  user: User = Depends(require("pos"))):
    """交班汇总：当前收银员当天各收款方式金额（只看自己的，不是营收报表）。"""
    check_store_access(user, store_id)
    from ..models import Payment
    d = day or now().date()
    rows = db.execute(
        select(Payment.kind, Payment.method, func.count(), func.sum(Payment.amount))
        .join(Order, Order.id == Payment.order_id)
        .where(Order.store_id == store_id, Payment.created_by == user.id,
               Payment.created_at >= datetime.combine(d, time.min),
               Payment.created_at < datetime.combine(d + timedelta(days=1), time.min))
        .group_by(Payment.kind, Payment.method)).all()
    out = {m: {"method_text": t, "pay_count": 0, "pay": 0, "refund_count": 0, "refund": 0}
           for m, t in svc.PAY_METHODS.items()}
    for kind, method, cnt, amt in rows:
        out[method][kind + "_count"] += cnt
        out[method][kind] += int(amt or 0)
    total = sum(v["pay"] - v["refund"] for v in out.values())
    return {"date": d.isoformat(), "cashier": user.display_name or user.username, "methods": out, "net": total}


@router.post("/exchanges/{eid}/print")
def print_exchange(eid: int, body: PrintIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """补打售后换货凭证。"""
    from ..models import Exchange
    ex = db.get(Exchange, eid)
    if not ex:
        raise HTTPException(404, "换货单不存在")
    o = _load(db, ex.order_id, user)
    if not has_perm(user, "reprint"):
        raise HTTPException(403, "没有补打小票权限")
    if o.store.print_mode == "agent":
        from ..services.printq import enqueue
        enqueue(db, o.store, o, "exchange", user, exchange=ex)
        db.commit()
        return {"queued": True, "order_no": o.no}
    r = _exchange_receipt(db, ex, user, True, body.escpos)
    db.commit()
    return r
