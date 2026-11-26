"""扫码点单在线付款（模拟通道）：待付款门店看不到、付成功才交给门店、超时取消回补库存、晚到的钱自动退回。"""
from datetime import timedelta

import pytest

from app import db as dbmod
from app.db import now
from app.main import expire_unpaid_once
from app.models import Order, PayRefundTxn, PayTxn
from app.services import pay
from app.services.pay.mock import MockGateway
from conftest import customer, stock_of


@pytest.fixture
def gws():
    pay.reset()
    g = {p: MockGateway(p) for p in ("wechat", "alipay")}
    for p, x in g.items():
        pay.set_gateway(p, x)
    yield g
    pay.reset()


def place(client, w, code="u1"):
    c = customer(client, code)
    o = c.post("/api/customer/orders", {"area_code": w["a1"]["code"], "location_note": "12床",
                                        "lines": [{"sku_id": w["small"]["id"], "qty": 3}]})
    return c, o


def cups(admin, w):
    return stock_of(admin, w["s1"]["location_id"], w["cup"]["id"])


def pay_mock(c, o, provider="wechat"):
    r = c.post(f"/api/customer/orders/{o['id']}/pay", {"provider": provider, "return_url": "/web/h5/?area=x"})
    assert r["paid"] is False and r["mock"] is True
    c.post(f"/api/customer/orders/{o['id']}/mock-pay")
    return c.post(f"/api/customer/orders/{o['id']}/check")


def test_area_reports_providers(client, world, gws):
    info = client.get(f"/api/customer/area/{world['a1']['code']}").json()
    assert info["pay"]["providers"] == ["wechat", "alipay"] and info["pay"]["minutes"] == 15


def test_no_channel_keeps_old_flow(client, admin, world):
    pay.reset()
    pay.set_gateway("wechat", None)
    pay.set_gateway("alipay", None)
    _, o = place(client, world)
    assert o["status"] == "pending"
    pay.reset()


def test_awaiting_hidden_then_paid(client, admin, world, gws):
    w = world
    clerk = w["clerk"]
    last = clerk.get("/api/orders/new", store_id=w["s1"]["id"])["last_id"]
    c, o = place(client, w)
    assert o["status"] == "awaiting_pay" and o["status_text"] == "待付款"
    assert cups(admin, w) == 97  # 先占库存
    assert clerk.get("/api/orders", store_id=w["s1"]["id"])["total"] == 0
    assert clerk.get("/api/orders/new", store_id=w["s1"]["id"], after_id=last)["orders"] == []
    # 待付款期间门店先收了一单：老办法按 id 取的话，晚付的扫码单会被漏掉
    clerk.post("/api/pos/checkout", {"store_id": w["s1"]["id"], "lines": [{"sku_id": w["small"]["id"], "qty": 1}],
                                     "payments": [{"method": "cash", "amount": 1000}]})
    last = clerk.get("/api/orders/new", store_id=w["s1"]["id"], after_id=last)["last_id"]
    o = pay_mock(c, o)
    assert o["pay_status"] == "paid" and o["status"] == "pending" and o["payments"][0]["method"] == "wechat"
    new = clerk.get("/api/orders/new", store_id=w["s1"]["id"], after_id=last)
    assert [x["id"] for x in new["orders"]] == [o["id"]] and new["pending_count"] == 1
    assert cups(admin, w) == 96  # 付款不再扣第二次
    assert clerk.get("/api/orders/new", store_id=w["s1"]["id"], after_id=new["last_id"])["orders"] == []


def test_auto_accept_after_paid(client, admin, world, gws):
    admin.put("/api/settings/rules", {"online_auto_accept": True})
    c, o = place(client, world)
    assert o["status"] == "awaiting_pay"
    o = pay_mock(c, o, "alipay")
    assert o["status"] == "accepted" and o["pay_status"] == "paid"


def test_expire_restores_stock(client, admin, world, gws):
    c, o = place(client, world)
    with dbmod.SessionLocal() as db:
        db.get(Order, o["id"]).pay_deadline = now() - timedelta(minutes=1)
        db.commit()
    assert expire_unpaid_once() == 1
    assert cups(admin, world) == 100
    mine = c.get("/api/customer/orders")
    assert mine[0]["status"] == "cancelled"
    c.req("POST", f"/api/customer/orders/{o['id']}/pay", 409, json={"provider": "wechat"})


def test_expire_skips_paid_in_time(client, admin, world, gws):
    c, o = place(client, world)
    c.post(f"/api/customer/orders/{o['id']}/pay", {"provider": "wechat"})
    with dbmod.SessionLocal() as db:
        t = db.query(PayTxn).one()
        gws["wechat"].mock_pay(t.out_no)  # 付了，但通知还没到
        db.get(Order, o["id"]).pay_deadline = now() - timedelta(minutes=1)
        db.commit()
    assert expire_unpaid_once() == 0
    assert c.get("/api/customer/orders")[0]["pay_status"] == "paid"


def test_late_payment_refunded(client, admin, world, gws):
    c, o = place(client, world)
    c.post(f"/api/customer/orders/{o['id']}/pay", {"provider": "alipay"})
    with dbmod.SessionLocal() as db:
        t = db.query(PayTxn).one()
        out_no = t.out_no
    # 关单没成功（例如网络），订单已超时取消，之后钱到了
    gws["alipay"].close = lambda *_: (_ for _ in ()).throw(pay.PayError("网络错误"))
    with dbmod.SessionLocal() as db:
        db.get(Order, o["id"]).pay_deadline = now() - timedelta(minutes=1)
        db.commit()
    assert expire_unpaid_once() == 1
    gws["alipay"].mock_pay(out_no)
    import json
    client.post("/api/pay/notify/alipay", content=json.dumps({"out_no": out_no}), headers={"x-mock-sign": "ok"})
    with dbmod.SessionLocal() as db:
        t = db.query(PayTxn).one()
        assert t.status == "paid" and t.refunded == t.amount and "自动退款" in t.message
        assert db.query(PayRefundTxn).one().status == "success"
        assert db.get(Order, o["id"]).status == "cancelled"


def test_customer_cancel_awaiting(client, admin, world, gws):
    c, o = place(client, world)
    c.post(f"/api/customer/orders/{o['id']}/pay", {"provider": "wechat"})
    o = c.post(f"/api/customer/orders/{o['id']}/cancel")
    assert o["status"] == "cancelled"
    assert cups(admin, world) == 100
    with dbmod.SessionLocal() as db:
        assert db.query(PayTxn).one().status == "closed"


def test_cancel_after_paid_refused(client, admin, world, gws):
    c, o = place(client, world)
    c.post(f"/api/customer/orders/{o['id']}/pay", {"provider": "wechat"})
    with dbmod.SessionLocal() as db:
        gws["wechat"].mock_pay(db.query(PayTxn).one().out_no)
    r = c.req("POST", f"/api/customer/orders/{o['id']}/cancel", 409)
    assert "已经付款成功" in r["detail"]


def test_repay_closes_old_and_other_customer(client, admin, world, gws):
    c, o = place(client, world)
    c.post(f"/api/customer/orders/{o['id']}/pay", {"provider": "wechat"})
    c.post(f"/api/customer/orders/{o['id']}/pay", {"provider": "alipay"})
    with dbmod.SessionLocal() as db:
        assert sorted((t.provider, t.status) for t in db.query(PayTxn)) == [("alipay", "pending"), ("wechat", "closed")]
    other = customer(client, "u2")
    other.req("POST", f"/api/customer/orders/{o['id']}/pay", 404, json={"provider": "wechat"})
    c.req("POST", f"/api/customer/orders/{o['id']}/pay", 400, json={"provider": "unionpay"})


def test_production_login_needs_pay(client, world, gws, monkeypatch):
    monkeypatch.setenv("SHOUYIN_ENV", "production")
    assert client.post("/api/customer/login", json={"code": "device123"}).status_code == 200
    pay.set_gateway("wechat", None)
    pay.set_gateway("alipay", None)
    assert client.post("/api/customer/login", json={"code": "device123"}).status_code == 503


def test_wx_oauth_back_is_safe():
    from app.routers.customer import _safe_back
    assert _safe_back("/web/h5/?area=abc") == "/web/h5/?area=abc"
    assert _safe_back("https://evil.com/") == "/web/h5/"
    assert _safe_back("/web/h5//evil.com") == "/web/h5/"
