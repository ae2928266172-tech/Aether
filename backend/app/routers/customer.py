"""小程序顾客端接口：扫区域码 → 免注册登录 → 选商品规格 → 下单 → 查看 / 取消订单。

顾客订单为“到店 / 门店收款”方式：下单不付款，门店接单后线下收款记账。尚未接入微信在线支付。
"""
import os

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Area, Category, Customer, Order, Product
from ..security import current_customer, make_token
from ..serialize import order_out, product_out
from ..services import orders as svc
from ..settings_store import get_setting

router = APIRouter(prefix="/api/customer", tags=["小程序顾客端"])


class LoginIn(BaseModel):
    code: str = Field(min_length=1)


def _openid(code: str) -> str:
    appid, secret = os.environ.get("WECHAT_APPID"), os.environ.get("WECHAT_SECRET")
    if not appid or not secret:
        if os.environ.get("SHOUYIN_ENV") == "production":
            raise HTTPException(503, "小程序尚未配置 AppID")
        return "dev_" + code  # 开发模式：没有小程序账号时用于测试
    r = httpx.get("https://api.weixin.qq.com/sns/jscode2session", timeout=10, params={
        "appid": appid, "secret": secret, "js_code": code, "grant_type": "authorization_code"}).json()
    if not r.get("openid"):
        raise HTTPException(400, "微信登录失败：" + str(r.get("errmsg", "")))
    return r["openid"]


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    openid = _openid(body.code)
    c = db.scalar(select(Customer).where(Customer.openid == openid))
    if not c:
        c = Customer(openid=openid)
        db.add(c)
        db.commit()
    return {"token": make_token(str(c.id), "customer", hours=24 * 30), "customer_id": c.id}


def _area(db: Session, code: str) -> Area:
    a = db.scalar(select(Area).where(Area.code == code))
    if not a or not a.active or not a.store.active:
        raise HTTPException(404, "二维码已失效，请联系门店")
    return a


@router.get("/area/{code}")
def area_info(code: str, db: Session = Depends(get_db)):
    a = _area(db, code)
    rules = get_setting(db, "rules")
    return {"area_id": a.id, "area_name": a.name, "store_id": a.store_id, "store_name": a.store.name,
            "accept_online_orders": a.store.accept_online_orders, "area_label": rules["area_label"],
            "location_label": rules["location_label"], "location_required": rules["online_location_required"]}


@router.get("/menu/{code}")
def menu(code: str, db: Session = Depends(get_db)):
    _area(db, code)
    cats = [{"id": c.id, "name": c.name, "parent_id": c.parent_id}
            for c in db.scalars(select(Category).where(Category.active.is_(True)).order_by(Category.sort, Category.id))]
    prods = []
    for p in db.scalars(select(Product).where(Product.active.is_(True), Product.online_visible.is_(True))
                        .order_by(Product.sort, Product.id)):
        d = product_out(p, admin=False)
        for s in d["skus"]:
            for k in ("stock_item_id", "stock_item_name", "deduct_qty", "barcode"):
                s.pop(k, None)
        if d["skus"]:
            prods.append(d)
    return {"categories": cats, "products": prods}


class LineIn(BaseModel):
    sku_id: int
    qty: int = Field(gt=0, le=999)


class OrderIn(BaseModel):
    area_code: str
    lines: list[LineIn]
    location_note: str = ""
    contact_phone: str = ""
    remark: str = Field("", max_length=200)
    request_id: str | None = None


def _public(o: Order) -> dict:
    d = order_out(o)
    d.pop("print_count", None)
    for p in d["payments"]:
        p.pop("received", None)
        p.pop("change", None)
    return d


@router.post("/orders")
def create_order(body: OrderIn, db: Session = Depends(get_db), c: Customer = Depends(current_customer)):
    a = _area(db, body.area_code)
    o = svc.online_create(db, c.id, a, [l.model_dump() for l in body.lines], body.location_note,
                          body.contact_phone, body.remark, body.request_id)
    db.commit()
    return _public(o)


@router.get("/orders")
def my_orders(db: Session = Depends(get_db), c: Customer = Depends(current_customer)):
    return [_public(o) for o in db.scalars(select(Order).where(Order.customer_id == c.id)
                                           .order_by(Order.id.desc()).limit(50))]


@router.post("/orders/{oid}/cancel")
def cancel(oid: int, db: Session = Depends(get_db), c: Customer = Depends(current_customer)):
    o = svc.get_order(db, oid, lock=True)
    if o.customer_id != c.id:
        raise HTTPException(404, "订单不存在")
    svc.cancel(db, o, None, "", by_customer=True)
    db.commit()
    return _public(o)
