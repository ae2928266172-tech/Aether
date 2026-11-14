"""2026-11-14 代码审查后补的回归测试。"""
from conftest import customer, login, stock_of


def _paid_order(w, qty=10):
    return w["clerk"].post("/api/pos/checkout", {"store_id": w["s1"]["id"], "lines": [{"sku_id": w["small"]["id"], "qty": qty}],
                                                 "payments": [{"method": "cash", "amount": 1000 * qty}]})


def test_refund_amount_must_match_goods(admin, world):
    """退款金额不能和退货件数脱钩：不能“10 件全退、只退 10 元”把订单标成已全额退款。"""
    w, clerk = world, world["clerk"]
    o = _paid_order(w)
    item = o["items"][0]["id"]
    clerk.post(f"/api/orders/{o['id']}/refund", {"lines": [{"order_item_id": item, "qty": 10}], "amount": 1000}, expect=400)
    clerk.post(f"/api/orders/{o['id']}/refund", {"lines": [{"order_item_id": item, "qty": 3}], "amount": 0}, expect=400)
    d = clerk.get(f"/api/orders/{o['id']}")
    assert d["pay_status"] == "paid" and d["refunded_amount"] == 0 and d["items"][0]["refunded_qty"] == 0
    assert stock_of(admin, w["s1"]["location_id"], w["cup"]["id"]) == 90
    # 金额填对或不填都可以
    r = clerk.post(f"/api/orders/{o['id']}/refund", {"lines": [{"order_item_id": item, "qty": 3}], "amount": 3000})
    assert r["refund"]["amount"] == 3000 and r["order"]["pay_status"] == "partial_refunded"
    r = clerk.post(f"/api/orders/{o['id']}/refund", {"lines": [{"order_item_id": item, "qty": 7}]})
    assert r["order"]["pay_status"] == "refunded" and r["order"]["refunded_amount"] == 10000


def test_cash_received_null_means_exact(admin, world):
    """实收不传时按应收记，找零 0；传了但少于应收要拒绝。"""
    w, clerk = world, world["clerk"]
    body = {"store_id": w["s1"]["id"], "lines": [{"sku_id": w["small"]["id"], "qty": 1}]}
    o = clerk.post("/api/pos/checkout", {**body, "payments": [{"method": "cash", "amount": 1000, "received": None}]})
    assert o["payments"][0]["received"] == 1000 and o["payments"][0]["change"] == 0
    clerk.post("/api/pos/checkout", {**body, "payments": [{"method": "cash", "amount": 1000, "received": 999}]}, expect=400)


def test_double_collect_only_once(client, admin, world):
    w, clerk = world, world["clerk"]
    c = customer(client)
    o = c.post("/api/customer/orders", {"area_code": w["a1"]["code"], "location_note": "1",
                                        "lines": [{"sku_id": w["small"]["id"], "qty": 2}]})
    pay = {"payments": [{"method": "wechat", "amount": 2000}]}
    clerk.post(f"/api/orders/{o['id']}/collect", pay)
    clerk.post(f"/api/orders/{o['id']}/collect", pay, expect=409)
    d = clerk.get(f"/api/orders/{o['id']}")
    assert d["paid_amount"] == 2000 and len([p for p in d["payments"] if p["kind"] == "pay"]) == 1
    assert stock_of(admin, w["s1"]["location_id"], w["cup"]["id"]) == 98


def test_role_limits_reject_bad_values(admin, world):
    role = world["store_role"]
    base = {"name": role["name"], "permissions": role["permissions"]}
    admin.put(f"/api/roles/{role['id']}", {**base, "min_discount_rate": 0}, expect=422)
    admin.put(f"/api/roles/{role['id']}", {**base, "min_discount_rate": None}, expect=422)
    admin.put(f"/api/roles/{role['id']}", {**base, "max_adjust_amount": -1}, expect=422)


def test_login_lockout(client, admin, world):
    for _ in range(5):
        assert client.post("/api/auth/login", json={"username": "clerk1", "password": "wrong"}).status_code == 400
    # 第 6 次即使密码正确也被锁住
    r = client.post("/api/auth/login", json={"username": "clerk1", "password": "123456"})
    assert r.status_code == 429 and "分钟" in r.json()["detail"]
    # 不影响别的账号
    login(client, "admin", "admin123")


def _agent(admin, w):
    s = w["s1"]
    admin.put(f"/api/stores/{s['id']}", {"name": s["name"], "print_mode": "agent"})
    return admin.post(f"/api/stores/{s['id']}/printer/key")["print_key"]


def test_print_resend_counts_once_and_gives_up(client, admin, world, monkeypatch):
    """小助手没回报完成时重发：打印次数只在回报完成时记一次；重发 3 次仍没回报就放弃。"""
    from datetime import timedelta
    from app.routers import print_agent as pa
    w, clerk = world, world["clerk"]
    key = _agent(admin, w)
    c = customer(client)
    o = c.post("/api/customer/orders", {"area_code": w["a1"]["code"], "location_note": "1",
                                        "lines": [{"sku_id": w["small"]["id"], "qty": 1}]})
    nxt = lambda: client.get("/api/print-agent/next", params={"key": key})
    monkeypatch.setattr(pa, "RESEND_AFTER", timedelta(seconds=-1))  # 立即视为超时
    r1 = nxt(); r2 = nxt()
    assert r1.status_code == r2.status_code == 200 and r1.headers["x-job-id"] == r2.headers["x-job-id"]
    assert r1.headers["x-beep"] == "1" and r2.headers["x-beep"] == "0"      # 重发不再响铃
    assert "【补打】".encode("gb18030") not in r2.content                    # 重发的不是补打
    assert clerk.get(f"/api/orders/{o['id']}")["print_count"] == 0          # 还没回报完成，不计数
    client.post(f"/api/print-agent/done/{r2.headers['x-job-id']}", params={"key": key})
    client.post(f"/api/print-agent/done/{r2.headers['x-job-id']}", params={"key": key})  # 重复回报
    d = clerk.get(f"/api/orders/{o['id']}")
    assert d["print_count"] == 1 and [l["action"] for l in d["logs"]].count("打印小票") == 1
    assert nxt().status_code == 204
    # 一直不回报：发满 3 次后放弃，不会无限重复出票
    c.post("/api/customer/orders", {"area_code": w["a1"]["code"], "location_note": "2",
                                    "lines": [{"sku_id": w["small"]["id"], "qty": 1}]})
    assert [nxt().status_code for _ in range(4)] == [200, 200, 200, 204]


def test_bad_print_job_does_not_block_queue(client, admin, world, monkeypatch):
    from app.routers import print_agent as pa
    w = world
    key = _agent(admin, w)
    c = customer(client)
    for i in range(2):
        c.post("/api/customer/orders", {"area_code": w["a1"]["code"], "location_note": str(i + 1),
                                        "lines": [{"sku_id": w["small"]["id"], "qty": 1}]})
    real, calls = pa.escpos.build, []

    def flaky(receipt):
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("坏小票")
        return real(receipt)
    monkeypatch.setattr(pa.escpos, "build", flaky)
    r = client.get("/api/print-agent/next", params={"key": key})
    assert r.status_code == 200 and "2".encode() in r.content  # 第一张失败被跳过，直接拿到第二张
    client.post(f"/api/print-agent/done/{r.headers['x-job-id']}", params={"key": key})
    assert client.get("/api/print-agent/next", params={"key": key}).status_code == 204


def test_upgrade_adds_missing_columns(tmp_path):
    """旧数据库升级：新版本多出来的字段（含布尔、数字、文字默认值）能自动补上。"""
    from sqlalchemy import create_engine, inspect, text
    from app.db import Base
    from app.seed import _add_missing_columns
    eng = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    Base.metadata.create_all(eng)
    with eng.begin() as conn:
        conn.execute(text("INSERT INTO locations (name, kind, active, created_at, updated_at) VALUES ('店', 'store', 1, '2026-01-01', '2026-01-01')"))
        conn.execute(text("INSERT INTO stores (name, address, phone, location_id, active, staff_can_view_stock, staff_can_edit_stock, "
                          "accept_online_orders, print_mode, auto_print_online, auto_print_pos, created_at, updated_at) "
                          "VALUES ('店', '', '', 1, 1, 0, 0, 1, 'browser', 1, 1, '2026-01-01', '2026-01-01')"))
        for col in ("print_mode", "auto_print_online", "auto_print_pos"):
            conn.execute(text(f"ALTER TABLE stores DROP COLUMN {col}"))
        conn.execute(text("ALTER TABLE print_jobs DROP COLUMN attempts"))
    _add_missing_columns(eng)
    cols = {c["name"] for c in inspect(eng).get_columns("stores")}
    assert {"print_mode", "auto_print_online", "auto_print_pos"} <= cols
    with eng.connect() as conn:
        assert tuple(conn.execute(text("SELECT print_mode, auto_print_online, auto_print_pos FROM stores")).one()) == ("browser", 1, 1)
    assert "attempts" in {c["name"] for c in inspect(eng).get_columns("print_jobs")}
    eng.dispose()


def test_public_url_setting(admin, world):
    admin.put("/api/settings/rules", {"public_url": "shop.example.com"}, expect=400)
    assert admin.put("/api/settings/rules", {"public_url": "https://shop.example.com/"})["public_url"] == "https://shop.example.com"
    assert admin.get("/api/settings/rules")["public_url"] == "https://shop.example.com"
