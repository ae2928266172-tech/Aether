"""门店、区域（二维码）、仓库、库存与出入库。"""
import secrets
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db, now
from ..models import Area, Location, StockBalance, StockDoc, StockItem, StockMove, Store, Supplier, User
from ..security import check_store_access, current_user, has_perm, require, store_stock_access
from ..serialize import area_out, dt, num, store_out
from ..services import inventory as inv
from .reports import _xlsx

router = APIRouter(prefix="/api", tags=["门店与库存"])


# ---------------- 门店 ----------------

class StoreIn(BaseModel):
    name: str = Field(min_length=1)
    address: str = ""
    phone: str = ""
    active: bool = True
    staff_can_view_stock: bool = False
    staff_can_edit_stock: bool = False
    accept_online_orders: bool = True
    print_mode: str = Field("browser", pattern="^(browser|agent)$")
    auto_print_online: bool = True
    auto_print_pos: bool = True


@router.get("/stores")
def list_stores(db: Session = Depends(get_db), user: User = Depends(current_user)):
    stores = db.scalars(select(Store).order_by(Store.id)).all()
    if not user.role.is_admin:
        mine = {s.id for s in user.stores}
        stores = [s for s in stores if s.id in mine]
    return [store_out(s) for s in stores]


@router.post("/stores")
def create_store(body: StoreIn, db: Session = Depends(get_db), _: User = Depends(require("stores"))):
    if db.scalar(select(Store).where(Store.name == body.name)) or \
            db.scalar(select(Location).where(Location.name == body.name)):
        raise HTTPException(400, "门店名称已存在")
    loc = Location(name=body.name, kind="store", active=body.active)
    db.add(loc)
    db.flush()
    s = Store(location_id=loc.id, **body.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return store_out(s)


@router.put("/stores/{sid}")
def update_store(sid: int, body: StoreIn, db: Session = Depends(get_db), _: User = Depends(require("stores"))):
    s = db.get(Store, sid)
    if not s:
        raise HTTPException(404, "门店不存在")
    for k, v in body.model_dump().items():
        setattr(s, k, v)
    s.location.name = body.name
    s.location.active = body.active
    db.commit()
    return store_out(s)


# ---------------- 区域与二维码 ----------------

class AreaIn(BaseModel):
    store_id: int
    name: str = Field(min_length=1)
    sort: int = 0
    active: bool = True
    no_qty_limit: bool = False  # 本区域不限点单数量


@router.get("/areas")
def list_areas(store_id: int | None = None, db: Session = Depends(get_db), user: User = Depends(current_user)):
    q = select(Area).order_by(Area.store_id, Area.sort, Area.id)
    if store_id:
        check_store_access(user, store_id)
        q = q.where(Area.store_id == store_id)
    elif not user.role.is_admin:
        q = q.where(Area.store_id.in_([s.id for s in user.stores]))
    return [area_out(a) for a in db.scalars(q)]


@router.post("/areas")
def create_area(body: AreaIn, db: Session = Depends(get_db), _: User = Depends(require("stores"))):
    if not db.get(Store, body.store_id):
        raise HTTPException(400, "门店不存在")
    if db.scalar(select(Area).where(Area.store_id == body.store_id, Area.name == body.name)):
        raise HTTPException(400, "该门店已有同名区域")
    a = Area(code=secrets.token_hex(8), **body.model_dump())
    db.add(a)
    db.commit()
    db.refresh(a)
    return area_out(a)


@router.put("/areas/{aid}")
def update_area(aid: int, body: AreaIn, db: Session = Depends(get_db), _: User = Depends(require("stores"))):
    a = db.get(Area, aid)
    if not a:
        raise HTTPException(404, "区域不存在")
    for k, v in body.model_dump().items():
        setattr(a, k, v)
    db.commit()
    db.refresh(a)
    return area_out(a)


@router.post("/areas/{aid}/reset-code")
def reset_area_code(aid: int, db: Session = Depends(get_db), _: User = Depends(require("stores"))):
    """二维码泄露或想作废旧码时，重新生成；旧二维码立即失效。"""
    a = db.get(Area, aid)
    if not a:
        raise HTTPException(404, "区域不存在")
    a.code = secrets.token_hex(8)
    db.commit()
    return area_out(a)


class AreaRuleIn(BaseModel):
    product_id: int
    allowed: bool = True
    min_qty: int | None = Field(None, ge=0)  # 空 = 用商品设置；0 = 本区域不限
    max_qty: int | None = Field(None, ge=0)


@router.get("/areas/{aid}/rules")
def get_area_rules(aid: int, db: Session = Depends(get_db), _: User = Depends(require("stores"))):
    """区域点单规则：列出所有小程序可见的商品，以及在这个区域的实际效果。"""
    from ..models import Product
    from ..services.area_rules import effective, load_rules
    a = db.get(Area, aid)
    if not a:
        raise HTTPException(404, "区域不存在")
    rules = load_rules(db, a)
    out = []
    for p in db.scalars(select(Product).where(Product.active.is_(True), Product.online_visible.is_(True))
                        .order_by(Product.sort, Product.id)):
        r = rules.get(p.id)
        eff = effective(p, a, rules)
        out.append({"product_id": p.id, "name": p.name, "unit": p.unit,
                    "product_min_qty": p.min_qty, "product_max_qty": p.max_qty,
                    "area_limited": p.area_limited and a.id not in {x.id for x in p.areas},
                    "allowed": r.allowed if r else True, "min_qty": r.min_qty if r else None,
                    "max_qty": r.max_qty if r else None,
                    "effective": {"allowed": eff.allowed, "min_qty": eff.min_qty, "max_qty": eff.max_qty}})
    return {"area": area_out(a), "rules": out}


@router.put("/areas/{aid}/rules")
def put_area_rules(aid: int, body: list[AreaRuleIn], db: Session = Depends(get_db), _: User = Depends(require("stores"))):
    """整体保存某个区域的规则；和商品默认一样（能点、没填数量）的行不存。"""
    from ..models import AreaProductRule, Product
    a = db.get(Area, aid)
    if not a:
        raise HTTPException(404, "区域不存在")
    for r in body:
        if not db.get(Product, r.product_id):
            raise HTTPException(400, "商品不存在")
        if r.min_qty and r.max_qty and r.min_qty > r.max_qty:
            raise HTTPException(400, "起订量不能大于限购量")
    for old in db.scalars(select(AreaProductRule).where(AreaProductRule.area_id == aid)):
        db.delete(old)
    db.flush()
    for r in body:
        if r.allowed and r.min_qty is None and r.max_qty is None:
            continue
        db.add(AreaProductRule(area_id=aid, product_id=r.product_id, allowed=r.allowed, min_qty=r.min_qty, max_qty=r.max_qty))
    db.commit()
    return get_area_rules(aid, db)


# ---------------- 库存地点（仓库） ----------------

class WarehouseIn(BaseModel):
    name: str = Field(min_length=1)
    active: bool = True


@router.get("/locations")
def list_locations(db: Session = Depends(get_db), _: User = Depends(require("inventory"))):
    stores = {s.location_id: s.id for s in db.scalars(select(Store))}
    return [{"id": l.id, "name": l.name, "kind": l.kind, "kind_text": "仓库" if l.kind == "warehouse" else "门店",
             "store_id": stores.get(l.id), "active": l.active}
            for l in db.scalars(select(Location).order_by(Location.kind.desc(), Location.id))]


@router.post("/warehouses")
def create_warehouse(body: WarehouseIn, db: Session = Depends(get_db), _: User = Depends(require("inventory"))):
    if db.scalar(select(Location).where(Location.name == body.name)):
        raise HTTPException(400, "名称已存在")
    loc = Location(name=body.name, kind="warehouse", active=body.active)
    db.add(loc)
    db.commit()
    return {"id": loc.id, "name": loc.name, "kind": loc.kind, "active": loc.active}


@router.put("/warehouses/{lid}")
def update_warehouse(lid: int, body: WarehouseIn, db: Session = Depends(get_db), _: User = Depends(require("inventory"))):
    loc = db.get(Location, lid)
    if not loc or loc.kind != "warehouse":
        raise HTTPException(404, "仓库不存在")
    loc.name, loc.active = body.name, body.active
    db.commit()
    return {"id": loc.id, "name": loc.name, "kind": loc.kind, "active": loc.active}


# ---------------- 库存查询与出入库 ----------------

def _balances(db: Session, location_id: int, keyword: str = ""):
    q = select(StockItem).order_by(StockItem.id)
    if keyword:
        q = q.where(StockItem.name.contains(keyword) | StockItem.code.contains(keyword))
    bal = dict(db.execute(select(StockBalance.stock_item_id, StockBalance.qty)
                          .where(StockBalance.location_id == location_id)).all())
    return [{"stock_item_id": i.id, "name": i.name, "code": i.code, "unit": i.unit, "qty": num(bal.get(i.id)),
             "alert_qty": None if i.alert_qty is None else num(i.alert_qty), "low": inv.is_low(bal.get(i.id), i.alert_qty)}
            for i in db.scalars(q) if i.active or bal.get(i.id)]


@router.get("/stock")
def stock(location_id: int, keyword: str = "", db: Session = Depends(get_db), _: User = Depends(require("inventory"))):
    return _balances(db, location_id, keyword)


@router.get("/stores/{sid}/stock")
def store_stock(sid: int, keyword: str = "", db: Session = Depends(get_db), user: User = Depends(current_user)):
    store = store_stock_access(db, user, sid, edit=False)
    return _balances(db, store.location_id, keyword)


class DocLineIn(BaseModel):
    stock_item_id: int
    qty: float
    unit_cost: int | None = None  # 单价（分），入库填进价；不填按库存品成本


class DocIn(BaseModel):
    kind: str  # in / out / transfer / adjust
    from_location_id: int | None = None
    to_location_id: int | None = None
    supplier_id: int | None = None
    reason: str = ""  # 出库原因：领用 / 报损 / 退供应商 / 其他
    remark: str = ""
    request_id: str | None = None
    lines: list[DocLineIn]


DOC_KIND_TEXT = {"in": "入库", "out": "出库", "transfer": "调拨", "adjust": "盘点"}


def _doc_ctx(db: Session) -> dict:
    return {"names": {i.id: (i.name, i.unit) for i in db.scalars(select(StockItem))},
            "locs": {l.id: l.name for l in db.scalars(select(Location))},
            "users": {u.id: (u.display_name or u.username) for u in db.scalars(select(User))},
            "sups": {s.id: s.name for s in db.scalars(select(Supplier))}}


def _doc_out(db: Session, d: StockDoc, ctx: dict | None = None):
    ctx = ctx or _doc_ctx(db)
    names, locs, users, sups = ctx["names"], ctx["locs"], ctx["users"], ctx["sups"]
    lines = []
    for ln in d.lines:
        name, unit = names.get(ln.stock_item_id, ("", ""))
        row = {"stock_item_id": ln.stock_item_id, "name": name, "unit": unit, "qty": num(ln.qty),
               "unit_cost": ln.unit_cost, "amount": ln.amount}
        if d.kind == "adjust":  # 盘点：qty 是实盘数，diff 是盈亏数量（正为盘盈），amount 是盈亏金额
            row["book_qty"] = None if ln.book_qty is None else num(ln.book_qty)
            row["diff"] = None if ln.book_qty is None else num(ln.qty - ln.book_qty)
        lines.append(row)
    amts = [ln["amount"] for ln in lines]
    if d.kind == "adjust":
        total_qty = sum((ln.qty - ln.book_qty for ln in d.lines if ln.book_qty is not None), inv.Decimal(0))
    else:
        total_qty = sum((ln.qty for ln in d.lines), inv.Decimal(0))
    return {"id": d.id, "no": d.no, "kind": d.kind, "kind_text": DOC_KIND_TEXT[d.kind],
            "from_location_id": d.from_location_id, "to_location_id": d.to_location_id,
            "from_location": locs.get(d.from_location_id), "to_location": locs.get(d.to_location_id),
            "supplier_id": d.supplier_id, "supplier_name": sups.get(d.supplier_id), "reason": d.reason or "",
            "remark": d.remark, "created_at": dt(d.created_at), "created_by_name": users.get(d.created_by, ""),
            "voided": d.voided_at is not None, "voided_at": dt(d.voided_at),
            "voided_by_name": users.get(d.voided_by, ""), "void_reason": d.void_reason or "",
            "total_qty": num(total_qty), "total_amount": None if any(a is None for a in amts) else sum(amts),
            "lines": lines}


@router.post("/stock-docs")
def create_doc(body: DocIn, db: Session = Depends(get_db), user: User = Depends(require("inventory"))):
    if body.supplier_id and not db.get(Supplier, body.supplier_id):
        raise HTTPException(400, "供应商不存在")
    d = inv.create_doc(db, kind=body.kind, lines=[ln.model_dump() for ln in body.lines], user_id=user.id,
                       from_location_id=body.from_location_id, to_location_id=body.to_location_id,
                       supplier_id=body.supplier_id, remark=body.remark, request_id=body.request_id,
                       reason=body.reason)
    db.commit()
    return _doc_out(db, d)


class VoidIn(BaseModel):
    reason: str = Field(min_length=1, max_length=200)


@router.post("/stock-docs/{did}/void")
def void_doc(did: int, body: VoidIn, db: Session = Depends(get_db), user: User = Depends(require("inventory"))):
    """作废填错的单据：库存按原单反向冲回，单据保留并标“已作废”。"""
    d = inv.void_doc(db, did, user.id, body.reason)
    db.commit()
    return _doc_out(db, d)


class StoreAdjustIn(BaseModel):
    remark: str = ""
    request_id: str | None = None
    lines: list[DocLineIn]


@router.post("/stores/{sid}/stock-adjust")
def store_adjust(sid: int, body: StoreAdjustIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """门店盘点（填实盘数），需后台允许本店修改库存。"""
    store = store_stock_access(db, user, sid, edit=True)
    # 门店盘点不让填单价，盈亏金额按库存品成本算
    d = inv.create_doc(db, kind="adjust", lines=[ln.model_dump(exclude={"unit_cost"}) for ln in body.lines],
                       user_id=user.id,
                       to_location_id=store.location_id, remark=body.remark or "门店盘点",
                       request_id=body.request_id)
    db.commit()
    return _doc_out(db, d)


@router.get("/stock-docs")
def list_docs(location_id: int | None = None, kind: str | None = None, begin: date | None = None,
              end: date | None = None, keyword: str = "", page: int = 1, size: int = 100, export: bool = False,
              db: Session = Depends(get_db), _: User = Depends(require("inventory"))):
    size = max(1, min(size, 500))
    q = select(StockDoc).order_by(StockDoc.id.desc())
    if not export:
        q = q.offset((max(page, 1) - 1) * size).limit(size)
    if keyword:
        q = q.where(StockDoc.no.contains(keyword.strip()) | StockDoc.remark.contains(keyword.strip()))
    if location_id:
        q = q.where((StockDoc.from_location_id == location_id) | (StockDoc.to_location_id == location_id))
    if kind:
        q = q.where(StockDoc.kind == kind)
    if begin:
        q = q.where(StockDoc.created_at >= datetime.combine(begin, time.min))
    if end:
        q = q.where(StockDoc.created_at < datetime.combine(end + timedelta(days=1), time.min))
    ctx = _doc_ctx(db)
    docs = [_doc_out(db, d, ctx) for d in db.scalars(q)]
    if export:  # 每行一个库存品，方便在 Excel 里筛选、汇总
        yuan = lambda v: None if v is None else v / 100
        rows = []
        for d in docs:
            for ln in d["lines"]:
                rows.append([d["no"], d["kind_text"], d["created_at"], d["from_location"] or "", d["to_location"] or "",
                             d["supplier_name"] or "", d["reason"], ln["name"], ln["unit"], ln.get("book_qty"), ln["qty"],
                             ln.get("diff"), yuan(ln["unit_cost"]), yuan(ln["amount"]), d["created_by_name"], d["remark"],
                             "已作废：" + d["void_reason"] if d["voided"] else ""])
        header = ["单号", "类型", "时间", "调出 / 出库地点", "调入 / 入库地点", "供应商", "出库原因", "库存品", "单位",
                  "账面数（盘点）", "数量 / 实盘数", "盈亏数（盘点）", "单价", "金额 / 盈亏金额", "制单人", "备注", "状态"]
        return _xlsx("出入库单据", header, rows, f"出入库单据_{begin or ''}_{end or ''}")
    return docs


@router.get("/stock-ledger")
def stock_ledger(location_id: int, begin: date | None = None, end: date | None = None, keyword: str = "",
                 export: bool = False, db: Session = Depends(get_db), _: User = Depends(require("inventory"))):
    today = now().date()
    b, e = begin or today, end or today
    rows = inv.ledger(db, location_id, b, e, keyword)
    if export:
        loc = db.get(Location, location_id)
        cols = ["opening", *inv.LEDGER_COLUMNS, "closing", "current"]
        header = ["库存品", "编码", "单位", "期初", *inv.LEDGER_COLUMNS.values(), "结余", "当前库存", "预警量", "低于预警"]
        out = [[r["name"], r["code"], r["unit"], *[num(r[c]) for c in cols],
                None if r["alert_qty"] is None else num(r["alert_qty"]), "是" if r["low"] else ""] for r in rows]
        return _xlsx("库存台账", header, out, f"库存台账_{loc.name if loc else location_id}_{b}_{e}")
    return [{k: (num(v) if k not in ("name", "code", "unit", "stock_item_id", "low", "alert_qty") else v)
             for k, v in r.items()} | {"alert_qty": None if r["alert_qty"] is None else num(r["alert_qty"])}
            for r in rows]


@router.get("/stock-alerts")
def stock_alerts(location_id: int | None = None, db: Session = Depends(get_db), _: User = Depends(require("inventory"))):
    """库存预警：各仓库、门店里库存小于等于预警量的库存品。"""
    return [{**r, "qty": num(r["qty"]), "alert_qty": num(r["alert_qty"]), "short": num(r["short"])}
            for r in inv.low_stock(db, location_id)]


@router.get("/stock-moves")
def stock_moves(location_id: int, stock_item_id: int, begin: date | None = None, end: date | None = None,
                db: Session = Depends(get_db), _: User = Depends(require("inventory"))):
    today = now().date()
    b, e = begin or today, end or today
    q = (select(StockMove).where(StockMove.location_id == location_id, StockMove.stock_item_id == stock_item_id,
                                 StockMove.created_at >= datetime.combine(b, time.min),
                                 StockMove.created_at < datetime.combine(e + timedelta(days=1), time.min))
         .order_by(StockMove.id))
    from ..models import Order
    out = []
    for m in db.scalars(q):
        ref = ""
        if m.doc_id:
            d = db.get(StockDoc, m.doc_id)
            ref = d.no + (f"（{d.remark}）" if d.remark else "") + (f" · {m.note}" if m.note else "")
        elif m.order_id:
            ref = db.get(Order, m.order_id).no
        out.append({"id": m.id, "kind": m.kind, "kind_text": inv.LEDGER_COLUMNS[m.kind], "qty": num(m.qty),
                    "balance_after": num(m.balance_after), "ref": ref, "created_at": dt(m.created_at)})
    return out
