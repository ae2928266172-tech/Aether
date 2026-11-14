"""门店、区域（二维码）、仓库、库存与出入库。"""
import secrets
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db, now
from ..models import Area, Location, StockBalance, StockDoc, StockItem, StockMove, Store, User
from ..security import check_store_access, current_user, has_perm, require, store_stock_access
from ..serialize import area_out, dt, num, store_out
from ..services import inventory as inv

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
    return [{"stock_item_id": i.id, "name": i.name, "code": i.code, "unit": i.unit, "qty": num(bal.get(i.id))}
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


class DocIn(BaseModel):
    kind: str  # in / out / transfer / adjust
    from_location_id: int | None = None
    to_location_id: int | None = None
    supplier_id: int | None = None
    remark: str = ""
    request_id: str | None = None
    lines: list[DocLineIn]


def _doc_out(db: Session, d: StockDoc):
    names = {i.id: (i.name, i.unit) for i in db.scalars(select(StockItem))}
    locs = {l.id: l.name for l in db.scalars(select(Location))}
    return {"id": d.id, "no": d.no, "kind": d.kind,
            "kind_text": {"in": "入库", "out": "出库", "transfer": "调拨", "adjust": "盘点"}[d.kind],
            "from_location": locs.get(d.from_location_id), "to_location": locs.get(d.to_location_id),
            "remark": d.remark, "created_at": dt(d.created_at),
            "lines": [{"stock_item_id": ln.stock_item_id, "name": names.get(ln.stock_item_id, ("", ""))[0],
                       "unit": names.get(ln.stock_item_id, ("", ""))[1], "qty": num(ln.qty)} for ln in d.lines]}


@router.post("/stock-docs")
def create_doc(body: DocIn, db: Session = Depends(get_db), user: User = Depends(require("inventory"))):
    d = inv.create_doc(db, kind=body.kind, lines=[ln.model_dump() for ln in body.lines], user_id=user.id,
                       from_location_id=body.from_location_id, to_location_id=body.to_location_id,
                       supplier_id=body.supplier_id, remark=body.remark, request_id=body.request_id)
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
    d = inv.create_doc(db, kind="adjust", lines=[ln.model_dump() for ln in body.lines], user_id=user.id,
                       to_location_id=store.location_id, remark=body.remark or "门店盘点",
                       request_id=body.request_id)
    db.commit()
    return _doc_out(db, d)


@router.get("/stock-docs")
def list_docs(location_id: int | None = None, kind: str | None = None, begin: date | None = None,
              end: date | None = None, db: Session = Depends(get_db), _: User = Depends(require("inventory"))):
    q = select(StockDoc).order_by(StockDoc.id.desc()).limit(500)
    if location_id:
        q = q.where((StockDoc.from_location_id == location_id) | (StockDoc.to_location_id == location_id))
    if kind:
        q = q.where(StockDoc.kind == kind)
    if begin:
        q = q.where(StockDoc.created_at >= datetime.combine(begin, time.min))
    if end:
        q = q.where(StockDoc.created_at < datetime.combine(end + timedelta(days=1), time.min))
    return [_doc_out(db, d) for d in db.scalars(q)]


@router.get("/stock-ledger")
def stock_ledger(location_id: int, begin: date | None = None, end: date | None = None, keyword: str = "",
                 db: Session = Depends(get_db), _: User = Depends(require("inventory"))):
    today = now().date()
    rows = inv.ledger(db, location_id, begin or today, end or today, keyword)
    return [{k: (num(v) if k not in ("name", "code", "unit", "stock_item_id") else v) for k, v in r.items()}
            for r in rows]


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
            ref = d.no + (f"（{d.remark}）" if d.remark else "")
        elif m.order_id:
            ref = db.get(Order, m.order_id).no
        out.append({"id": m.id, "kind": m.kind, "kind_text": inv.LEDGER_COLUMNS[m.kind], "qty": num(m.qty),
                    "balance_after": num(m.balance_after), "ref": ref, "created_at": dt(m.created_at)})
    return out
