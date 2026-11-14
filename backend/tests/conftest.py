import os
import tempfile

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["SHOUYIN_SECRET"] = "test-secret-0123456789abcdef0123456789"
os.environ["SHOUYIN_MEDIA"] = tempfile.mkdtemp()
os.environ.pop("WECHAT_APPID", None)

import pytest
from fastapi.testclient import TestClient

from app import db as dbmod
from app.db import Base
from app.main import app
from app.seed import seed


class Api:
    def __init__(self, client: TestClient, token: str | None = None):
        self.c, self.token = client, token

    def _h(self):
        return {"Authorization": "Bearer " + self.token} if self.token else {}

    def req(self, method, url, expect=200, **kw):
        r = self.c.request(method, url, headers=self._h(), **kw)
        assert r.status_code == expect, f"{method} {url} -> {r.status_code} {r.text}"
        return r.json() if r.headers.get("content-type", "").startswith("application/json") else r

    def get(self, url, expect=200, **kw):
        return self.req("GET", url, expect, params=kw or None)

    def post(self, url, body=None, expect=200):
        return self.req("POST", url, expect, json=body if body is not None else {})

    def put(self, url, body, expect=200):
        return self.req("PUT", url, expect, json=body)


@pytest.fixture
def client():
    from app.routers import auth as auth_router
    auth_router._FAILS.clear()
    Base.metadata.drop_all(dbmod.engine)
    Base.metadata.create_all(dbmod.engine)
    with dbmod.SessionLocal() as db:
        seed(db)
        db.commit()
    with TestClient(app) as c:
        yield c


def login(client, username, password):
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return Api(client, r.json()["token"])


@pytest.fixture
def admin(client):
    return login(client, "admin", "admin123")


@pytest.fixture
def world(client, admin):
    """两家门店、各一个区域；库存品“纸杯”，商品“杯装水”小份扣 1、大份扣 2，另一商品“冰水”也扣纸杯。"""
    s1 = admin.post("/api/stores", {"name": "一号店"})
    s2 = admin.post("/api/stores", {"name": "二号店"})
    a1 = admin.post("/api/areas", {"store_id": s1["id"], "name": "一病区"})
    a2 = admin.post("/api/areas", {"store_id": s2["id"], "name": "二病区"})
    sup = admin.post("/api/suppliers", {"name": "南京供应商"})
    cat = admin.post("/api/categories", {"name": "饮品"})
    cup = admin.post("/api/stock-items", {"name": "纸杯", "unit": "个", "cost": 50, "supplier_id": sup["id"]})
    pad = admin.post("/api/stock-items", {"name": "护理垫", "unit": "片", "cost": 300})
    water = admin.post("/api/products", {
        "name": "杯装水", "category_id": cat["id"], "supplier_id": sup["id"], "unit": "杯",
        "skus": [{"name": "小份", "price": 1000, "barcode": "690001", "stock_item_id": cup["id"], "deduct_qty": 1},
                 {"name": "大份", "price": 1800, "barcode": "690002", "stock_item_id": cup["id"], "deduct_qty": 2}]})
    ice = admin.post("/api/products", {
        "name": "冰水", "category_id": cat["id"], "unit": "杯",
        "skus": [{"name": "默认", "price": 500, "stock_item_id": cup["id"], "deduct_qty": 1}]})
    padp = admin.post("/api/products", {
        "name": "一次性护理垫", "unit": "包", "reg_cert_no": "苏械备20230001", "registrant": "示例医疗",
        "skus": [{"name": "10片装", "price": 3000, "stock_item_id": pad["id"], "deduct_qty": 10}]})
    wh = next(l for l in admin.get("/api/locations") if l["kind"] == "warehouse")
    # 中心仓库入库 1000 个纸杯、500 片护理垫，调拨 100 个纸杯、100 片护理垫到一号店
    admin.post("/api/stock-docs", {"kind": "in", "to_location_id": wh["id"],
                                   "lines": [{"stock_item_id": cup["id"], "qty": 1000},
                                             {"stock_item_id": pad["id"], "qty": 500}]})
    admin.post("/api/stock-docs", {"kind": "transfer", "from_location_id": wh["id"], "to_location_id": s1["location_id"],
                                   "lines": [{"stock_item_id": cup["id"], "qty": 100},
                                             {"stock_item_id": pad["id"], "qty": 100}]})
    admin.post("/api/stock-docs", {"kind": "transfer", "from_location_id": wh["id"], "to_location_id": s2["location_id"],
                                   "lines": [{"stock_item_id": cup["id"], "qty": 50}]})
    roles = admin.get("/api/roles")
    store_role = next(r for r in roles if not r["is_admin"])
    admin.post("/api/users", {"username": "clerk1", "display_name": "店员甲", "role_id": store_role["id"],
                              "store_ids": [s1["id"]], "password": "123456"})
    clerk = login(client, "clerk1", "123456")
    small, big = water["skus"]
    return {"s1": s1, "s2": s2, "a1": a1, "a2": a2, "cup": cup, "pad": pad, "water": water, "ice": ice,
            "padp": padp, "small": small, "big": big, "wh": wh, "clerk": clerk, "store_role": store_role,
            "sup": sup, "cat": cat}


def stock_of(admin, location_id, stock_item_id):
    rows = admin.get("/api/stock", location_id=location_id)
    return next(r["qty"] for r in rows if r["stock_item_id"] == stock_item_id)


def customer(client, code="u1"):
    r = client.post("/api/customer/login", json={"code": code})
    assert r.status_code == 200, r.text
    return Api(client, r.json()["token"])
