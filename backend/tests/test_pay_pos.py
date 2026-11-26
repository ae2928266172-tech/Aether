"""门店收银在线收款（模拟通道）：付成功才开单扣库存、查单 / 回调只开一次单、撤销、原路退款。"""
import json

import pytest

from app import db as dbmod
from app.models import PayRefundTxn, PayTxn
from app.services import pay
from app.services.pay.mock import MockGateway
from conftest import stock_of

WX_OK, WX_SLOW, WX_FAIL, WX_HOLD = "134567890123456780", "134567890123456787", "134567890123456788", "134567890123456789"
ALI_OK = "286543210987654320"


@pytest.fixture
def gws():
    pay.reset()
    g = {p: MockGateway(p) for p in ("wechat", "alipay")}
    for p, x in g.items():
        pay.set_gateway(p, x)
    yield g
    pay.reset()


def start(w, **kw):
    body = {"store_id": w["s1"]["id"], "lines": [{"sku_id": w["small"]["id"], "qty": 2}], **kw}
    return w["clerk"].post("/api/pay/pos/start", body)


def cups(admin, w):
    return stock_of(admin, w["s1"]["location_id"], w["cup"]["id"])


def test_micropay_creates_paid_order(admin, world, gws):
    w = world
    t = start(w, auth_code=WX_OK, request_id="r1")
    assert t["status"] == "paid" and t["amount"] == 2000 and t["provider"] == "wechat"
    o = t["order"]
    assert o["pay_status"] == "paid" and o["source"] == "pos"
    assert o["payments"][0]["method"] == "wechat" and o["payments"][0]["online"] is True
    assert cups(admin, w) == 98
    # 网络重试：同一个请求号返回同一笔，不重复扣款、不重复开单
    t2 = start(w, auth_code=WX_OK, request_id="r1")
    assert t2["id"] == t["id"] and t2["order"]["id"] == o["id"]
    assert cups(admin, w) == 98


def test_discounted_amount(admin, world, gws):
    t = start(world, auth_code=ALI_OK, payable=1800)
    assert t["amount"] == 1800 and t["order"]["payable_amount"] == 1800 and t["provider"] == "alipay"


def test_userpaying_then_query(admin, world, gws):
    w = world
    t = start(w, auth_code=WX_SLOW)
    assert t["status"] == "pending" and t["order"] is None
    assert cups(admin, w) == 100  # 没付成功不扣库存
    t = w["clerk"].get(f"/api/pay/pos/txns/{t['id']}")
    assert t["status"] == "paid" and t["order"]["pay_status"] == "paid"
    assert cups(admin, w) == 98
    t = w["clerk"].get(f"/api/pay/pos/txns/{t['id']}")
    assert cups(admin, w) == 98


def test_failed_code_no_order(admin, world, gws):
    t = start(world, auth_code=WX_FAIL)
    assert (t["status"], t["message"], t["order"]) == ("failed", "余额不足", None)
    assert cups(admin, world) == 100


def test_close_pending(admin, world, gws):
    w = world
    t = start(w, auth_code=WX_HOLD)
    t = w["clerk"].post(f"/api/pay/pos/txns/{t['id']}/close")
    assert t["status"] == "closed" and t["order"] is None
    assert cups(admin, w) == 100


def test_native_qr_paid_by_notify_once(client, admin, world, gws):
    w = world
    t = start(w, provider="alipay", request_id="q1")
    assert t["status"] == "pending" and t["code_url"].startswith("mock://alipay/")
    body = json.dumps({"out_no": t["out_no"]})
    for _ in range(2):
        assert client.post("/api/pay/notify/alipay", content=body, headers={"x-mock-sign": "ok"}).status_code == 200
    t = w["clerk"].get(f"/api/pay/pos/txns/{t['id']}")
    assert t["status"] == "paid" and t["order"]["payable_amount"] == 2000
    assert cups(admin, w) == 98
    with dbmod.SessionLocal() as db:
        assert db.query(PayTxn).count() == 1


def test_native_paid_before_close(admin, world, gws):
    """店员点“不收了”的瞬间顾客刚好付完：照常开单，不关单。"""
    w = world
    t = start(w, provider="wechat")
    w["clerk"].post(f"/api/pay/mock/{t['out_no']}/pay")
    t = w["clerk"].post(f"/api/pay/pos/txns/{t['id']}/close")
    assert t["status"] == "paid" and t["order"]


def test_other_store_cannot_see(client, admin, world, gws):
    w = world
    t = start(w, auth_code=WX_SLOW)
    role = w["store_role"]
    admin.post("/api/users", {"username": "clerk2", "display_name": "乙", "role_id": role["id"],
                              "store_ids": [w["s2"]["id"]], "password": "123456"})
    from conftest import login
    c2 = login(client, "clerk2", "123456")
    c2.get(f"/api/pay/pos/txns/{t['id']}", expect=403)


def test_checkout_fails_after_paid_is_kept(admin, world, gws):
    w = world
    t = start(w, provider="wechat")
    p = admin.get(f"/api/products/{w['water']['id']}")
    p["active"] = False
    admin.put(f"/api/products/{w['water']['id']}", p)
    w["clerk"].post(f"/api/pay/mock/{t['out_no']}/pay")
    t = w["clerk"].get(f"/api/pay/pos/txns/{t['id']}")
    assert t["status"] == "paid" and t["order"] is None and "开单失败" in t["message"]


def test_refund_original_route(admin, world, gws):
    w = world
    o = start(w, auth_code=WX_OK)["order"]
    item = o["items"][0]
    r = w["clerk"].post(f"/api/orders/{o['id']}/refund", {"lines": [{"order_item_id": item["id"], "qty": 1}],
                                                          "method": "wechat", "request_id": "rf1"})
    assert r["refund"]["amount"] == 1000
    # 重发不会再退一次
    w["clerk"].post(f"/api/orders/{o['id']}/refund", {"lines": [{"order_item_id": item["id"], "qty": 1}],
                                                     "method": "wechat", "request_id": "rf1"})
    with dbmod.SessionLocal() as db:
        rts = db.query(PayRefundTxn).all()
        assert [(x.amount, x.status) for x in rts] == [(1000, "success")]
        assert db.query(PayTxn).one().refunded == 1000
    # 剩下的改用现金退：不走原路
    w["clerk"].post(f"/api/orders/{o['id']}/refund", {"lines": [{"order_item_id": item["id"], "qty": 1}],
                                                     "method": "cash"})
    with dbmod.SessionLocal() as db:
        assert db.query(PayRefundTxn).count() == 1


def test_refund_rejected_rolls_back(admin, world, gws):
    w = world
    o = start(w, auth_code=WX_OK)["order"]
    gws["wechat"].refund = lambda *a: pay.RefundResult("failed", message="账户余额不足")
    item = o["items"][0]
    r = w["clerk"].post(f"/api/orders/{o['id']}/refund", {"lines": [{"order_item_id": item["id"], "qty": 2}],
                                                          "method": "wechat"}, expect=502)
    assert "账户余额不足" in r["detail"] and "现金" in r["detail"]
    o2 = w["clerk"].get(f"/api/orders/{o['id']}")
    assert o2["pay_status"] == "paid" and o2["refunded_amount"] == 0
    assert cups(admin, w) == 98


def test_disabled_channel(world):
    pay.reset()
    pay.set_gateway("wechat", None)
    r = world["clerk"].req("POST", "/api/pay/pos/start", 400, json={
        "store_id": world["s1"]["id"], "lines": [{"sku_id": world["small"]["id"], "qty": 1}], "auth_code": WX_OK})
    assert "尚未开通" in r["detail"]
    pay.reset()
