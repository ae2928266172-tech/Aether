"""库存服务：所有库存变化都经过 change_stock，同时写流水和结余。"""
import uuid
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import now
from ..models import Location, StockBalance, StockDoc, StockDocLine, StockItem, StockMove


def D(x) -> Decimal:
    return x if isinstance(x, Decimal) else Decimal(str(x))


def get_balance(db: Session, location_id: int, stock_item_id: int, lock: bool = False) -> StockBalance:
    q = select(StockBalance).where(StockBalance.location_id == location_id,
                                   StockBalance.stock_item_id == stock_item_id)
    if lock:
        q = q.with_for_update()
    bal = db.scalar(q)
    if bal is None:
        bal = StockBalance(location_id=location_id, stock_item_id=stock_item_id, qty=Decimal(0))
        db.add(bal)
        db.flush()
    return bal


def change_stock(db: Session, *, location_id: int, stock_item_id: int, qty, kind: str,
                 allow_negative: bool = True, doc_id: int | None = None, order_id: int | None = None,
                 user_id: int | None = None, at: datetime | None = None) -> StockMove:
    qty = D(qty)
    bal = get_balance(db, location_id, stock_item_id, lock=True)
    new_qty = D(bal.qty) + qty
    if qty < 0 and new_qty < 0 and not allow_negative:
        item = db.get(StockItem, stock_item_id)
        loc = db.get(Location, location_id)
        raise HTTPException(409, f"{loc.name if loc else ''}库存不足：{item.name if item else stock_item_id} "
                                 f"现有 {fmt(bal.qty)}，需要 {fmt(-qty)}")
    bal.qty = new_qty
    mv = StockMove(location_id=location_id, stock_item_id=stock_item_id, qty=qty, kind=kind,
                   doc_id=doc_id, order_id=order_id, created_by=user_id, created_at=at or now(),
                   balance_after=new_qty)
    db.add(mv)
    return mv


def is_low(qty, alert_qty) -> bool:
    """库存预警：设置了预警量，且库存小于等于预警量。"""
    return alert_qty is not None and D(qty or 0) <= D(alert_qty)


def low_stock(db: Session, location_id: int | None = None) -> list[dict]:
    """所有启用的仓库 / 门店里，低于预警量的库存品。没有库存记录的按 0 算。"""
    items = db.scalars(select(StockItem).where(StockItem.active.is_(True), StockItem.alert_qty.is_not(None))
                       .order_by(StockItem.id)).all()
    if not items:
        return []
    locs_q = select(Location).where(Location.active.is_(True)).order_by(Location.kind.desc(), Location.id)
    if location_id:
        locs_q = locs_q.where(Location.id == location_id)
    locs = db.scalars(locs_q).all()
    bal = {(lid, sid): D(q) for lid, sid, q in db.execute(
        select(StockBalance.location_id, StockBalance.stock_item_id, StockBalance.qty))}
    out = []
    for loc in locs:
        for it in items:
            q = bal.get((loc.id, it.id), Decimal(0))
            if is_low(q, it.alert_qty):
                out.append({"location_id": loc.id, "location_name": loc.name, "location_kind": loc.kind,
                            "stock_item_id": it.id, "name": it.name, "code": it.code, "unit": it.unit,
                            "qty": q, "alert_qty": D(it.alert_qty), "short": D(it.alert_qty) - q})
    return out


def fmt(q) -> str:
    q = D(q).normalize()
    s = format(q, "f")
    return s


def _doc_no(prefix: str) -> str:
    return f"{prefix}{now():%Y%m%d%H%M%S}{uuid.uuid4().hex[:4].upper()}"


DOC_PREFIX = {"in": "RK", "out": "CK", "transfer": "DB", "adjust": "PD"}


def create_doc(db: Session, *, kind: str, lines: list[dict], user_id: int | None,
               from_location_id: int | None = None, to_location_id: int | None = None,
               supplier_id: int | None = None, remark: str = "", request_id: str | None = None,
               allow_negative: bool = False) -> StockDoc:
    """入库 in（to）、出库 out（from）、调拨 transfer（from→to）、盘点 adjust（to，数量为实盘数）。

    同一个 request_id 只生效一次，重复提交直接返回第一次的单据。
    """
    if request_id:
        exist = db.scalar(select(StockDoc).where(StockDoc.request_id == request_id))
        if exist:
            return exist
    if kind not in DOC_PREFIX:
        raise HTTPException(400, "单据类型错误")
    if kind in ("in", "adjust") and not to_location_id:
        raise HTTPException(400, "请选择入库地点")
    if kind == "out" and not from_location_id:
        raise HTTPException(400, "请选择出库地点")
    if kind == "transfer":
        if not from_location_id or not to_location_id:
            raise HTTPException(400, "请选择调出和调入地点")
        if from_location_id == to_location_id:
            raise HTTPException(400, "调出和调入不能是同一个地点")
    for lid in (from_location_id, to_location_id):
        if lid is not None:
            loc = db.get(Location, lid)
            if not loc or not loc.active:
                raise HTTPException(400, "库存地点不存在或已停用")
    merged: dict[int, Decimal] = defaultdict(Decimal)
    for ln in lines:
        q = D(ln["qty"])
        if kind != "adjust" and q <= 0:
            continue
        if kind == "adjust" and q < 0:
            raise HTTPException(400, "盘点数量不能为负数")
        if not db.get(StockItem, ln["stock_item_id"]):
            raise HTTPException(400, f"库存品 {ln['stock_item_id']} 不存在")
        if kind == "adjust":
            merged[ln["stock_item_id"]] = q
        else:
            merged[ln["stock_item_id"]] += q
    if not merged:
        raise HTTPException(400, "请至少填写一个数量")

    doc = StockDoc(no=_doc_no(DOC_PREFIX[kind]), kind=kind, from_location_id=from_location_id,
                   to_location_id=to_location_id, supplier_id=supplier_id, remark=remark,
                   created_by=user_id, request_id=request_id)
    db.add(doc)
    db.flush()
    for sid, q in merged.items():
        db.add(StockDocLine(doc_id=doc.id, stock_item_id=sid, qty=q))
        if kind == "in":
            change_stock(db, location_id=to_location_id, stock_item_id=sid, qty=q, kind="in",
                         doc_id=doc.id, user_id=user_id)
        elif kind == "out":
            change_stock(db, location_id=from_location_id, stock_item_id=sid, qty=-q, kind="out",
                         doc_id=doc.id, user_id=user_id, allow_negative=allow_negative)
        elif kind == "transfer":
            change_stock(db, location_id=from_location_id, stock_item_id=sid, qty=-q, kind="transfer_out",
                         doc_id=doc.id, user_id=user_id, allow_negative=allow_negative)
            change_stock(db, location_id=to_location_id, stock_item_id=sid, qty=q, kind="transfer_in",
                         doc_id=doc.id, user_id=user_id)
        elif kind == "adjust":
            cur = D(get_balance(db, to_location_id, sid).qty)
            diff = q - cur
            if diff != 0:
                change_stock(db, location_id=to_location_id, stock_item_id=sid, qty=diff, kind="adjust",
                             doc_id=doc.id, user_id=user_id)
    db.flush()
    db.refresh(doc)
    return doc


LEDGER_COLUMNS = {
    "in": "入库", "out": "出库", "transfer_in": "调入", "transfer_out": "调出",
    "sale": "销售", "sale_return": "退货回补", "adjust": "盘点调整",
}


def ledger(db: Session, location_id: int, begin: date, end: date, keyword: str = "") -> list[dict]:
    """台账：期初、各类变动、结余。期初 = 开始日 0 点前的流水累计。"""
    start = datetime.combine(begin, time.min)
    stop = datetime.combine(end + timedelta(days=1), time.min)
    items_q = select(StockItem).order_by(StockItem.id)
    if keyword:
        items_q = items_q.where(StockItem.name.contains(keyword) | StockItem.code.contains(keyword))
    items = db.scalars(items_q).all()
    opening = dict(db.execute(
        select(StockMove.stock_item_id, func.sum(StockMove.qty))
        .where(StockMove.location_id == location_id, StockMove.created_at < start)
        .group_by(StockMove.stock_item_id)).all())
    period = defaultdict(lambda: defaultdict(Decimal))
    for sid, kind, q in db.execute(
            select(StockMove.stock_item_id, StockMove.kind, func.sum(StockMove.qty))
            .where(StockMove.location_id == location_id, StockMove.created_at >= start,
                   StockMove.created_at < stop)
            .group_by(StockMove.stock_item_id, StockMove.kind)).all():
        period[sid][kind] = D(q)
    current = dict(db.execute(select(StockBalance.stock_item_id, StockBalance.qty)
                              .where(StockBalance.location_id == location_id)).all())
    rows = []
    for it in items:
        op = D(opening.get(it.id) or 0)
        p = period.get(it.id, {})
        if not it.active and op == 0 and not p and D(current.get(it.id) or 0) == 0:
            continue
        row = {"stock_item_id": it.id, "name": it.name, "code": it.code, "unit": it.unit, "opening": op}
        row["alert_qty"] = it.alert_qty
        total = op
        for k in LEDGER_COLUMNS:
            v = D(p.get(k, 0))
            # 出库类在表里显示为正数
            row[k] = -v if k in ("out", "transfer_out", "sale") else v
            total += v
        row["closing"] = total
        row["current"] = D(current.get(it.id) or 0)
        row["low"] = is_low(row["current"], it.alert_qty)
        rows.append(row)
    return rows
