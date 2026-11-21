"""真实并发测试：起一个真的服务端（多线程处理请求），多个“收银机”同时发请求。

默认用临时 SQLite 文件；设置 TEST_PG_URL=postgresql+psycopg://… 时同样的场景在 PostgreSQL 上再跑一遍。
覆盖：两台机器同时卖同一商品、库存不够时不能超卖、重复点击收款、同时退款、重复退款、断网重试。
"""
import os
import socket
import subprocess
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

import httpx
import pytest

from conftest import Api, build_world, login

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
N = 24  # 同时发出的请求数


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _targets():
    yield pytest.param("sqlite", id="sqlite")
    yield pytest.param("pg", id="postgresql", marks=pytest.mark.skipif(not os.environ.get("TEST_PG_URL"),
                                                                       reason="没设 TEST_PG_URL"))


@pytest.fixture(params=list(_targets()))
def live(request, tmp_path):
    if request.param == "pg":
        from sqlalchemy import create_engine
        from app.db import Base
        url = os.environ["TEST_PG_URL"]
        eng = create_engine(url); Base.metadata.drop_all(eng); eng.dispose()
    else:
        url = f"sqlite:///{tmp_path}/c.db"
    port = _free_port()
    env = dict(os.environ, DATABASE_URL=url, SHOUYIN_MEDIA=str(tmp_path / "media"), SHOUYIN_ENV="test")
    proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(port), "--log-level", "warning"],
                            cwd=BACKEND, env=env)
    base = f"http://127.0.0.1:{port}"
    for _ in range(100):
        try:
            httpx.get(base + "/web/store/", timeout=1); break
        except httpx.HTTPError:
            time.sleep(0.1)
    client = httpx.Client(base_url=base, timeout=60)
    admin = login(client, "admin", "admin123")
    w = build_world(client, admin)
    yield client, admin, w
    client.close(); proc.terminate(); proc.wait(10)


def _parallel(fn, n=N):
    with ThreadPoolExecutor(n) as ex:
        return list(ex.map(fn, range(n)))


def _stock(admin, loc, item):
    return next(r["qty"] for r in admin.get("/api/stock", location_id=loc) if r["stock_item_id"] == item)


def _sale(w, qty=1, rid=None):
    return {"store_id": w["s1"]["id"], "lines": [{"sku_id": w["small"]["id"], "qty": qty}],
            "payments": [{"method": "cash", "amount": 1000 * qty}], "request_id": rid or uuid.uuid4().hex}


def _post(client, token, url, body):
    r = client.post(url, json=body, headers={"Authorization": "Bearer " + token})
    return r.status_code, (r.json() if r.headers.get("content-type", "").startswith("application/json") else r.text)


def test_two_tills_selling_same_item(live):
    client, admin, w = live
    loc, cup = w["s1"]["location_id"], w["cup"]["id"]
    before = _stock(admin, loc, cup)
    res = _parallel(lambda i: _post(client, (admin if i % 2 else w["clerk"]).token, "/api/pos/checkout", _sale(w)))
    assert [c for c, _ in res] == [200] * N, [r for r in res if r[0] != 200][:3]
    assert len({b["no"] for _, b in res}) == N
    assert _stock(admin, loc, cup) == before - N, "每一单都要扣到，不能丢"


def test_no_oversell_when_negative_stock_not_allowed(live):
    client, admin, w = live
    loc, cup = w["s1"]["location_id"], w["cup"]["id"]
    admin.put("/api/settings/rules", {"pos_allow_negative": False})
    have = int(_stock(admin, loc, cup))
    admin.post("/api/stock-docs", {"kind": "out", "from_location_id": loc,
                                   "lines": [{"stock_item_id": cup, "qty": have - 10}]})
    res = _parallel(lambda i: _post(client, admin.token, "/api/pos/checkout", _sale(w)))
    codes = [c for c, _ in res]
    assert codes.count(200) == 10 and set(codes) <= {200, 409, 400}, codes
    assert _stock(admin, loc, cup) == 0


def test_double_click_checkout_makes_one_order(live):
    client, admin, w = live
    loc, cup = w["s1"]["location_id"], w["cup"]["id"]
    before = _stock(admin, loc, cup)
    body = _sale(w, qty=2)
    res = _parallel(lambda i: _post(client, admin.token, "/api/pos/checkout", body))
    assert [c for c, _ in res] == [200] * N, [r for r in res if r[0] != 200][:3]
    assert len({b["id"] for _, b in res}) == 1, "同一请求号只能生成一张单"
    assert _stock(admin, loc, cup) == before - 2
    # 断网重试：过一会儿再发同一个请求，拿到的还是那张单
    assert _post(client, admin.token, "/api/pos/checkout", body)[1]["id"] == res[0][1]["id"]


def test_concurrent_refunds_never_exceed_order(live):
    client, admin, w = live
    loc, cup = w["s1"]["location_id"], w["cup"]["id"]
    code, order = _post(client, admin.token, "/api/pos/checkout", _sale(w, qty=5))
    assert code == 200
    after_sale = _stock(admin, loc, cup)
    item = order["items"][0]["id"]
    res = _parallel(lambda i: _post(client, admin.token, f"/api/orders/{order['id']}/refund",
                                    {"lines": [{"order_item_id": item, "qty": 1}], "request_id": uuid.uuid4().hex}))
    codes = [c for c, _ in res]
    assert codes.count(200) == 5 and set(codes) <= {200, 400, 409}, codes
    o = admin.get(f"/api/orders/{order['id']}")
    assert o["refunded_amount"] == 5000 and o["pay_status"] == "refunded"
    assert _stock(admin, loc, cup) == after_sale + 5, "退 5 件只回补 5 件"


def test_double_click_refund_makes_one_refund(live):
    client, admin, w = live
    code, order = _post(client, admin.token, "/api/pos/checkout", _sale(w, qty=3))
    body = {"lines": [{"order_item_id": order["items"][0]["id"], "qty": 1}], "request_id": uuid.uuid4().hex}
    res = _parallel(lambda i: _post(client, admin.token, f"/api/orders/{order['id']}/refund", body))
    assert [c for c, _ in res] == [200] * N, [r for r in res if r[0] != 200][:3]
    assert len({b["refund"]["id"] for _, b in res}) == 1
    assert admin.get(f"/api/orders/{order['id']}")["refunded_amount"] == 1000


def test_print_agent_polling_while_selling(live):
    """打印小助手轮询（GET 但会写“最后在线时间”、领任务）和收银同时进行，两边都不能报错。"""
    client, admin, w = live
    key = admin.post(f"/api/stores/{w['s1']['id']}/printer/key")["print_key"]

    def go(i):
        if i % 2:
            r = client.get("/api/print-agent/next", params={"key": key})
            return r.status_code if r.status_code != 200 else 204
        return _post(client, admin.token, "/api/pos/checkout", _sale(w))[0]
    codes = []
    for _ in range(3):
        codes += _parallel(go)
    assert set(codes) <= {200, 204}, [c for c in codes if c not in (200, 204)][:5]


def test_double_click_fulfill_requisition(live):
    client, admin, w = live
    req = admin.post(f"/api/stores/{w['s1']['id']}/requisitions",
                     {"lines": [{"stock_item_id": w["cup"]["id"], "qty": 5}], "request_id": uuid.uuid4().hex})
    wh_before = _stock(admin, w["wh"]["id"], w["cup"]["id"])
    body = {"from_location_id": w["wh"]["id"], "lines": [{"stock_item_id": w["cup"]["id"], "qty": 5}],
            "request_id": uuid.uuid4().hex}
    res = _parallel(lambda i: _post(client, admin.token, f"/api/requisitions/{req['id']}/fulfill", body), n=8)
    assert [c for c, _ in res] == [200] * 8, [r for r in res if r[0] != 200][:3]
    assert _stock(admin, w["wh"]["id"], w["cup"]["id"]) == wh_before - 5, "只发一次货"


def _moves_consistent(admin, loc, item):
    """流水逐条接得上：每条的“结存”= 上一条结存 + 本条数量，最后一条 = 当前库存。丢失更新会让链条断开。"""
    moves = admin.get("/api/stock-moves", location_id=loc, stock_item_id=item)
    bal = None
    for m in moves:
        if bal is not None:
            assert abs(m["balance_after"] - (bal + m["qty"])) < 1e-9, (m, bal)
        bal = m["balance_after"]
    assert bal == _stock(admin, loc, item)
    return moves


def test_stocktake_while_selling(live):
    """盘点和收银同时进行：每次盘点调整后的结存都必须正好等于实盘数，流水不能断。"""
    client, admin, w = live
    loc, cup = w["s1"]["location_id"], w["cup"]["id"]
    take = {"kind": "adjust", "to_location_id": loc, "lines": [{"stock_item_id": cup, "qty": 100}]}

    def go(i):
        if i % 3 == 0:
            return _post(client, admin.token, "/api/stock-docs", take)[0]
        return _post(client, admin.token, "/api/pos/checkout", _sale(w))[0]
    codes = _parallel(go)
    assert codes == [200] * N, codes
    moves = _moves_consistent(admin, loc, cup)
    adj = [m for m in moves if m["kind"] == "adjust"]
    assert adj and all(m["balance_after"] == 100 for m in adj), adj


def test_first_stock_in_from_many_requests(live):
    """新库存品第一次入库到某个地点（还没有库存行），多个请求同时到：都要成功，数量一件不少，批次不重复。"""
    client, admin, w = live
    item = admin.post("/api/stock-items", {"name": "新口罩", "unit": "个", "cost": 10})["id"]
    loc = w["s1"]["location_id"]
    line = {"stock_item_id": item, "qty": 3, "batch_no": "M1", "expiry_date": "2030-01-01"}
    res = _parallel(lambda i: _post(client, admin.token, "/api/stock-docs",
                                    {"kind": "in", "to_location_id": loc, "lines": [line]}))
    assert [c for c, _ in res] == [200] * N, [r for r in res if r[0] != 200][:3]
    assert _stock(admin, loc, item) == 3 * N
    _moves_consistent(admin, loc, item)
    batches = admin.get("/api/stock-batches", location_id=loc, stock_item_id=item)
    assert [(b["batch_no"], b["qty"]) for b in batches] == [("M1", 3 * N)]
