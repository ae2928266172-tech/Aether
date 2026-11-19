"""库存服务：所有库存变化都经过 change_stock，同时写流水和结余。"""
import uuid
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from ..db import now
from ..models import (BatchMove, Location, StockBalance, StockBatch, StockDoc, StockDocLine, StockItem,
                      StockMove)


def D(x) -> Decimal:
    return x if isinstance(x, Decimal) else Decimal(str(x))


def get_balance(db: Session, location_id: int, stock_item_id: int, lock: bool = False) -> StockBalance:
    q = select(StockBalance).where(StockBalance.location_id == location_id,
                                   StockBalance.stock_item_id == stock_item_id)
    if lock:
        q = q.with_for_update(of=StockBalance)
    bal = db.scalar(q)
    if bal is None:
        bal = StockBalance(location_id=location_id, stock_item_id=stock_item_id, qty=Decimal(0))
        db.add(bal)
        db.flush()
    return bal


def change_stock(db: Session, *, location_id: int, stock_item_id: int, qty, kind: str,
                 allow_negative: bool = True, doc_id: int | None = None, order_id: int | None = None,
                 user_id: int | None = None, at: datetime | None = None,
                 batch: dict | None = None, alloc: list | None = None) -> StockMove:
    """改库存并写流水。批次：batch 为入库批次信息（批号、生产日期、有效期至）；
    alloc 为指定动哪些批次 [(StockBatch, 数量)]；都不给时，减少的库存按最早到期的批次先扣。"""
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
    db.flush()
    if alloc is not None:
        for b, q in alloc:
            q = D(q)
            if q < 0:
                take = min(-q, max(D(b.qty), Decimal(0)))
                if take:
                    _batch_record(db, mv, b, -take)
                if -q - take > 0:
                    _consume_fifo(db, mv, -q - take)
            elif q > 0:
                _batch_record(db, mv, b, q)
    elif qty < 0:
        _consume_fifo(db, mv, -qty)
    elif qty > 0 and batch and any(batch.get(k) for k in ("batch_no", "production_date", "expiry_date")):
        b = find_batch(db, location_id, stock_item_id, batch.get("batch_no") or "",
                       batch.get("production_date"), batch.get("expiry_date"), create=True)
        _batch_record(db, mv, b, qty)
    # 批次合计不能超过库存（例如无批次信息的冲回）：超出的部分按最早到期先扣掉
    if qty < 0:
        db.flush()
        total = D(db.scalar(select(func.sum(StockBatch.qty)).where(
            StockBatch.location_id == location_id, StockBatch.stock_item_id == stock_item_id,
            StockBatch.qty > 0)) or 0)
        extra = total - max(new_qty, Decimal(0))
        if extra > 0:
            _consume_fifo(db, mv, extra)
    return mv


# ---------------- 批次 ----------------

def _batch_sort():
    # 有效期早的先出；没有有效期的排最后
    return (StockBatch.expiry_date.is_(None), StockBatch.expiry_date, StockBatch.id)


def find_batch(db: Session, location_id: int, stock_item_id: int, batch_no: str, production_date, expiry_date,
               create: bool = False) -> StockBatch | None:
    b = db.scalar(select(StockBatch).where(
        StockBatch.location_id == location_id, StockBatch.stock_item_id == stock_item_id,
        StockBatch.batch_no == (batch_no or ""),
        StockBatch.production_date.is_(None) if production_date is None else StockBatch.production_date == production_date,
        StockBatch.expiry_date.is_(None) if expiry_date is None else StockBatch.expiry_date == expiry_date))
    if b is None and create:
        b = StockBatch(location_id=location_id, stock_item_id=stock_item_id, batch_no=batch_no or "",
                       production_date=production_date, expiry_date=expiry_date, qty=Decimal(0))
        db.add(b)
        db.flush()
    return b


def _batch_record(db: Session, mv: StockMove, b: StockBatch, q: Decimal):
    b.qty = D(b.qty) + q
    db.add(BatchMove(move_id=mv.id, batch_id=b.id, qty=q))


def _consume_fifo(db: Session, mv: StockMove, need: Decimal):
    db.flush()
    for b in db.scalars(select(StockBatch).where(
            StockBatch.location_id == mv.location_id, StockBatch.stock_item_id == mv.stock_item_id,
            StockBatch.qty > 0).order_by(*_batch_sort()).with_for_update(of=StockBatch)):
        if need <= 0:
            break
        take = min(need, D(b.qty))
        _batch_record(db, mv, b, -take)
        need -= take


def move_allocs(db: Session, move_ids: list[int]) -> list[tuple[StockBatch, Decimal]]:
    if not move_ids:
        return []
    db.flush()  # 本次请求刚写的批次流水也要查得到（会话不自动 flush）
    return [(db.get(StockBatch, bm.batch_id), D(bm.qty))
            for bm in db.scalars(select(BatchMove).where(BatchMove.move_id.in_(move_ids)).order_by(BatchMove.id))]


def return_alloc(db: Session, order_id: int, location_id: int, stock_item_id: int, qty: Decimal) -> list:
    """销售退货回库：退回当初卖出的那些批次（到期晚的先退），剩下的不记批次。"""
    moves = db.scalars(select(StockMove.id).where(
        StockMove.order_id == order_id, StockMove.location_id == location_id,
        StockMove.stock_item_id == stock_item_id)).all()
    net: dict[int, Decimal] = defaultdict(Decimal)
    batches = {}
    for b, q in move_allocs(db, list(moves)):
        net[b.id] -= q  # 卖出为负，退回为正：剩下可退的 = -(卖出 + 已退)
        batches[b.id] = b
    out, left = [], D(qty)
    for bid in sorted(net, key=lambda i: (batches[i].expiry_date is None, batches[i].expiry_date or date.max,
                                          batches[i].id), reverse=True):
        if left <= 0:
            break
        q = min(left, net[bid])
        if q > 0:
            out.append((batches[bid], q))
            left -= q
    return out


def earliest_expiry(db: Session, location_id: int) -> dict[int, date]:
    """每个库存品在这个地点还有剩余的批次里，最早的有效期。"""
    return dict(db.execute(select(StockBatch.stock_item_id, func.min(StockBatch.expiry_date)).where(
        StockBatch.location_id == location_id, StockBatch.qty > 0, StockBatch.expiry_date.is_not(None))
        .group_by(StockBatch.stock_item_id)).all())


def batches_at(db: Session, location_id: int | None = None, stock_item_id: int | None = None) -> list[StockBatch]:
    q = select(StockBatch).where(StockBatch.qty > 0).order_by(*_batch_sort())
    if location_id:
        q = q.where(StockBatch.location_id == location_id)
    if stock_item_id:
        q = q.where(StockBatch.stock_item_id == stock_item_id)
    return list(db.scalars(q))


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
OUT_REASONS = ["领用", "报损", "退供应商", "其他"]


def _amount(qty: Decimal, unit_cost: int | None) -> int | None:
    if unit_cost is None:
        return None
    return int((D(qty) * unit_cost).quantize(Decimal(1), rounding="ROUND_HALF_UP"))


def create_doc(db: Session, *, kind: str, lines: list[dict], user_id: int | None,
               from_location_id: int | None = None, to_location_id: int | None = None,
               supplier_id: int | None = None, remark: str = "", request_id: str | None = None,
               allow_negative: bool = False, reason: str = "") -> StockDoc:
    """入库 in（to）、出库 out（from）、调拨 transfer（from→to）、盘点 adjust（to，数量为实盘数）。

    每行可带 unit_cost（分）：入库填进价；不填时按库存品当前成本，用来算单据金额、盘点盈亏金额。
    同一个 request_id 只生效一次，重复提交直接返回第一次的单据。
    """
    if request_id:
        exist = db.scalar(select(StockDoc).where(StockDoc.request_id == request_id))
        if exist:
            from .orders import same_request

            def qmap(pairs):
                m: dict[int, Decimal] = defaultdict(Decimal)
                for k, q in pairs:
                    m[int(k)] += D(q)
                return m
            same_request(exist.kind == kind and exist.created_by == user_id
                         and exist.from_location_id == from_location_id and exist.to_location_id == to_location_id
                         and qmap((l.stock_item_id, l.qty) for l in exist.lines)
                         == qmap((ln["stock_item_id"], ln["qty"]) for ln in lines))
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
    reason = (reason or "").strip()
    if kind == "out" and reason and reason not in OUT_REASONS:
        raise HTTPException(400, "出库原因只能是：" + "、".join(OUT_REASONS))
    # 入库时同一库存品可以分几个批次各占一行；其他单据同一库存品合并成一行
    merged: dict[tuple, Decimal] = defaultdict(Decimal)
    amounts: dict[tuple, int | None] = {}
    for ln in lines:
        q = D(ln["qty"])
        if kind != "adjust" and q <= 0:
            continue
        if kind == "adjust" and q < 0:
            raise HTTPException(400, "盘点数量不能为负数")
        item = db.get(StockItem, ln["stock_item_id"])
        if not item:
            raise HTTPException(400, f"库存品 {ln['stock_item_id']} 不存在")
        cost = ln.get("unit_cost")
        if cost is not None and cost < 0:
            raise HTTPException(400, "单价不能为负数")
        if cost is None:
            cost = item.cost
        sid = ln["stock_item_id"]
        key = (sid,)
        if kind == "in":
            bno, pd, ed = (ln.get("batch_no") or "").strip(), ln.get("production_date"), ln.get("expiry_date")
            if pd and ed and ed < pd:
                raise HTTPException(400, f"{item.name}：有效期至不能早于生产日期")
            key = (sid, bno, pd, ed)
        if kind == "adjust":
            if key in merged:  # 同一库存品写了两行：以前是后一行覆盖前一行，盘亏可能变盘盈，现在直接拒绝
                raise HTTPException(400, f"{item.name} 在盘点单里出现了两行，请合并成一行再提交")
            merged[key] = q
            amounts[key] = cost  # 盘点：这里先记单价，下面按盈亏数量算金额
        else:
            merged[key] += q
            amounts[key] = (amounts.get(key) or 0) + _amount(q, cost)
    if not merged:
        raise HTTPException(400, "请至少填写一个数量")

    doc = StockDoc(no=_doc_no(DOC_PREFIX[kind]), kind=kind, from_location_id=from_location_id,
                   to_location_id=to_location_id, supplier_id=supplier_id, remark=remark, reason=reason,
                   created_by=user_id, request_id=request_id)
    db.add(doc)
    db.flush()
    for key, q in merged.items():
        sid = key[0]
        if kind == "adjust":
            book = D(get_balance(db, to_location_id, sid).qty)
            db.add(StockDocLine(doc_id=doc.id, stock_item_id=sid, qty=q, book_qty=book,
                                unit_cost=amounts[key], amount=_amount(q - book, amounts[key])))
        else:
            amt = amounts[key]
            line = StockDocLine(doc_id=doc.id, stock_item_id=sid, qty=q, amount=amt,
                                unit_cost=int((D(amt) / q).quantize(Decimal(1), rounding="ROUND_HALF_UP")))
            if kind == "in":
                line.batch_no, line.production_date, line.expiry_date = key[1], key[2], key[3]
            db.add(line)
        if kind == "in":
            change_stock(db, location_id=to_location_id, stock_item_id=sid, qty=q, kind="in",
                         doc_id=doc.id, user_id=user_id,
                         batch={"batch_no": key[1], "production_date": key[2], "expiry_date": key[3]})
        elif kind == "out":
            change_stock(db, location_id=from_location_id, stock_item_id=sid, qty=-q, kind="out",
                         doc_id=doc.id, user_id=user_id, allow_negative=allow_negative)
        elif kind == "transfer":
            out = change_stock(db, location_id=from_location_id, stock_item_id=sid, qty=-q, kind="transfer_out",
                               doc_id=doc.id, user_id=user_id, allow_negative=allow_negative)
            # 批次跟着调过去
            dest = [(find_batch(db, to_location_id, sid, b.batch_no, b.production_date, b.expiry_date, create=True), -bq)
                    for b, bq in move_allocs(db, [out.id])]
            change_stock(db, location_id=to_location_id, stock_item_id=sid, qty=q, kind="transfer_in",
                         doc_id=doc.id, user_id=user_id, alloc=dest)
        elif kind == "adjust":
            cur = D(get_balance(db, to_location_id, sid).qty)
            diff = q - cur
            if diff != 0:
                change_stock(db, location_id=to_location_id, stock_item_id=sid, qty=diff, kind="adjust",
                             doc_id=doc.id, user_id=user_id)
    db.flush()
    db.refresh(doc)
    return doc


def void_doc(db: Session, doc_id: int, user_id: int | None, reason: str = "") -> StockDoc:
    """作废单据：按这张单当时产生的每笔库存变动反向冲回（允许冲成负数，和收银“库存不够也能卖”一致）。"""
    doc = db.scalar(select(StockDoc).where(StockDoc.id == doc_id).with_for_update(of=StockDoc))
    if not doc:
        raise HTTPException(404, "单据不存在")
    if doc.voided_at:
        raise HTTPException(409, "这张单据已经作废过了")
    # 先用一条带条件的 UPDATE 抢占“作废”：两个请求同时到（双击、两台电脑），只有一个能改成功，
    # 另一个改到 0 行直接返回 409。SQLite 不支持 SELECT ... FOR UPDATE，这样在 SQLite 和 PostgreSQL 上都可靠。
    at = now()
    won = db.execute(update(StockDoc).where(StockDoc.id == doc.id, StockDoc.voided_at.is_(None))
                     .values(voided_at=at, voided_by=user_id).execution_options(synchronize_session=False)).rowcount
    if won != 1:
        db.rollback()
        raise HTTPException(409, "这张单据已经作废过了")
    db.refresh(doc)
    moves = db.scalars(select(StockMove).where(StockMove.doc_id == doc.id, (StockMove.note == "") | StockMove.note.is_(None))
                       .order_by(StockMove.id)).all()
    for m in moves:
        rev = [(b, -q) for b, q in move_allocs(db, [m.id])]  # 批次也按原样冲回
        mv = change_stock(db, location_id=m.location_id, stock_item_id=m.stock_item_id, qty=-D(m.qty),
                          kind=m.kind, doc_id=doc.id, user_id=user_id, at=at, alloc=rev)
        mv.note = "作废冲回"
    doc.voided_at, doc.voided_by, doc.void_reason = at, user_id, (reason or "").strip()[:200]
    db.flush()
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
