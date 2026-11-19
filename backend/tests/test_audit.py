"""关键操作日志：改价、权限、账号、门店设置、业务规则、库存单据、作废、退款都能查到谁、何时、改前改后。"""


def logs(admin, **kw):
    return admin.get("/api/audit-logs", **kw)


def test_price_change_and_permissions_logged(admin, world):
    w = world
    p = admin.get(f"/api/products/{w['water']['id']}")
    skus = [{**s, "price": 1200 if s["name"] == "小份" else s["price"]} for s in p["skus"]]
    admin.put(f"/api/products/{p['id']}", {**p, "skus": skus, "category_ids": [w["cat"]["id"]]})
    r = logs(admin, action="改价")["rows"][0]
    assert r["target"] == "杯装水" and r["user_name"] == "管理员"
    assert "小份 10.00→12.00" in r["summary"]
    assert r["changes"]["规格「小份」.price"] == [1000, 1200]
    # 什么都不改再保存一次，不记日志
    n = logs(admin)["total"]
    p = admin.get(f"/api/products/{p['id']}")
    admin.put(f"/api/products/{p['id']}", {**p, "category_ids": [w["cat"]["id"]]})
    assert logs(admin)["total"] == n

    role = w["store_role"]
    admin.put(f"/api/roles/{role['id']}", {**role, "permissions": [x for x in role["permissions"] if x != "refund"]})
    r = logs(admin, action="角色权限")["rows"][0]
    assert "refund" in r["changes"]["permissions"][0] and "refund" not in r["changes"]["permissions"][1]


def test_account_store_rules_logged(admin, world):
    w = world
    u = next(x for x in admin.get("/api/users") if x["username"] == "clerk1")
    admin.put(f"/api/users/{u['id']}", {**u, "store_ids": [w["s1"]["id"], w["s2"]["id"]], "password": "newpass1",
                                         "role_id": u["role_id"]})
    r = logs(admin, action="账号")["rows"][0]
    assert r["target"] == "clerk1" and r["summary"] == "重置了密码"
    assert r["changes"]["门店"] == [["一号店"], ["一号店", "二号店"]]
    assert "password_hash" not in str(r["changes"])

    s = w["s1"]
    admin.put(f"/api/stores/{s['id']}", {**s, "staff_can_edit_stock": True})
    assert logs(admin, action="门店设置")["rows"][0]["changes"]["staff_can_edit_stock"] == [False, True]
    admin.put("/api/settings/rules", {"pos_allow_negative": False})
    assert logs(admin, action="业务规则")["rows"][0]["changes"]["pos_allow_negative"] == [True, False]


def test_stock_doc_void_and_refund_logged(admin, world):
    w = world
    d = admin.post("/api/stock-docs", {"kind": "out", "from_location_id": w["wh"]["id"],
                                       "lines": [{"stock_item_id": w["cup"]["id"], "qty": 3}], "reason": "报损"})
    r = logs(admin, action="库存单据", keyword=d["no"])["rows"][0]
    assert "出库 中心仓库：纸杯 3" in r["summary"]
    admin.post(f"/api/stock-docs/{d['id']}/void", {"reason": "填错了"})
    r = logs(admin, action="单据作废")["rows"][0]
    assert r["target"] == d["no"] and "填错了" in r["summary"]

    o = admin.post("/api/pos/checkout", {"store_id": w["s1"]["id"], "lines": [{"sku_id": w["small"]["id"], "qty": 2}],
                                         "payments": [{"method": "cash", "amount": 2000}]})
    admin.post(f"/api/orders/{o['id']}/refund", {"lines": [{"order_item_id": o["items"][0]["id"], "qty": 1}],
                                                 "restock": False, "reason": "顾客不要了"})
    r = logs(admin, action="退款")["rows"][0]
    assert r["target"] == o["no"]
    assert "退 10.00 元（现金）" in r["summary"] and "不回库存" in r["summary"] and "顾客不要了" in r["summary"]


def test_only_account_admins_can_read_logs(world):
    world["clerk"].get("/api/audit-logs", expect=403)
