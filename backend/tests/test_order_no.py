"""单号规则：门店收银 NJYFZX + 日期 + 四位流水；扫码订单 WECHAT / ALIPAY + 日期 + 四位流水。

门店和扫码各数各的，同一天互不影响；跨日从 0001 重新开始。
"""
from datetime import timedelta

from app.db import now
from conftest import customer


def _day():
    return f"{now():%Y%m%d}"


def _pos(admin, w):
    return admin.post("/api/pos/checkout", {
        "store_id": w["s1"]["id"], "lines": [{"sku_id": w["small"]["id"], "qty": 1}],
        "payments": [{"method": "cash", "amount": 1000}]})["no"]


def _online(client, w, channel=None, code="no1"):
    c = customer(client, code)
    body = {"area_code": w["a1"]["code"], "location_note": "1",
            "lines": [{"sku_id": w["small"]["id"], "qty": 1}]}
    if channel:
        body["channel"] = channel
    return c.post("/api/customer/orders", body)["no"]


def test_pos_orders_numbered_from_one(admin, world):
    today = _day()
    assert _pos(admin, world) == f"NJYFZX{today}0001"
    assert _pos(admin, world) == f"NJYFZX{today}0002"


def test_online_orders_share_one_line_and_prefix_by_channel(client, world):
    today = _day()
    assert _online(client, world, "wechat") == f"WECHAT{today}0001"
    assert _online(client, world, "alipay", code="no2") == f"ALIPAY{today}0002"
    assert _online(client, world, code="no3") == f"WECHAT{today}0003"  # 不传平台按微信算


def test_pos_and_online_count_separately(client, admin, world):
    today = _day()
    assert _pos(admin, world) == f"NJYFZX{today}0001"
    assert _online(client, world) == f"WECHAT{today}0001"
    assert _pos(admin, world) == f"NJYFZX{today}0002"
    assert _online(client, world, "alipay", code="no2") == f"ALIPAY{today}0002"


def test_counter_restarts_next_day(client, admin, world, monkeypatch):
    today = _day()
    assert _pos(admin, world) == f"NJYFZX{today}0001"
    tomorrow = now() + timedelta(days=1)
    monkeypatch.setattr("app.services.orders.now", lambda: tomorrow)
    assert _pos(admin, world) == f"NJYFZX{tomorrow:%Y%m%d}0001"
