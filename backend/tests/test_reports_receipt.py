from conftest import customer


def _sale(clerk, w, lines, **kw):
    q = clerk.post("/api/pos/quote", {"lines": lines, **kw})
    return clerk.post("/api/pos/checkout", {"store_id": w["s1"]["id"], "lines": lines, **kw,
                                            "payments": [{"method": "cash", "amount": q["payable_amount"]}]})


def test_reports_admin_only(admin, world):
    clerk = world["clerk"]
    clerk.get("/api/reports/revenue", expect=403)
    clerk.get("/api/reports/product-sales", expect=403)
    admin.get("/api/reports/revenue")


def test_revenue_and_product_detail(client, admin, world):
    w, clerk = world, world["clerk"]
    o1 = _sale(clerk, w, [{"sku_id": w["small"]["id"], "qty": 10}], payable=9500)
    o2 = _sale(clerk, w, [{"sku_id": w["big"]["id"], "qty": 2}])
    # 退 3 份小份
    item = o1["items"][0]
    rf = clerk.post(f"/api/orders/{o1['id']}/refund", {"lines": [{"order_item_id": item["id"], "qty": 3}]})
    assert rf["refund"]["amount"] == 2850
    # 二号店一单（管理员在二号店收银）
    admin.post("/api/pos/checkout", {"store_id": w["s2"]["id"], "lines": [{"sku_id": w["small"]["id"], "qty": 1}],
                                     "payments": [{"method": "wechat", "amount": 1000}]})
    # 未收款的小程序订单不计入营收
    c = customer(client)
    c.post("/api/customer/orders", {"area_code": w["a1"]["code"], "location_note": "1",
                                    "lines": [{"sku_id": w["small"]["id"], "qty": 1}]})

    rep = admin.get("/api/reports/revenue", store_id=w["s1"]["id"])
    t = rep["total"]
    assert (t["orders"], t["original"], t["discount"], t["received"], t["refunded"], t["net"]) == \
        (2, 13600, 500, 13100, 2850, 10250)
    assert (t["qty"], t["refund_qty"]) == (12, 3)
    # 成本：纸杯 0.5 元，小份 1 个、大份 2 个 → (10 + 4 − 3) × 50
    assert t["cost"] == 550 and t["profit"] == 10250 - 550
    assert rep["total"]["methods"]["cash"] == 10250
    all_ = admin.get("/api/reports/revenue")
    assert all_["total"]["net"] == 11250 and len({r["store_id"] for r in all_["rows"]}) == 2
    assert admin.get("/api/reports/revenue", group="month")["rows"][0]["period"].count("-") == 1

    ps = admin.get("/api/reports/product-sales", store_id=w["s1"]["id"])
    small = next(r for r in ps["rows"] if r["sku_id"] == w["small"]["id"])
    assert (small["sold_qty"], small["refund_qty"], small["net_qty"], small["paid"], small["refund"], small["net"]) == \
        (10, 3, 7, 9500, 2850, 6650)
    detail = admin.get("/api/reports/product-sales/detail", sku_id=w["small"]["id"], store_id=w["s1"]["id"])["rows"]
    assert [(d["type"], d["order_no"], d["qty"], d["paid"]) for d in detail] == \
        [("sale", o1["no"], 10, 9500), ("refund", o1["no"], -3, -2850)]
    assert o2


def test_exports(admin, world):
    _sale(world["clerk"], world, [{"sku_id": world["small"]["id"], "qty": 1}])
    for url, extra in (("/api/reports/revenue", {"group": "week"}), ("/api/reports/product-sales", {}),
                       ("/api/reports/product-sales/detail", {})):
        r = admin.c.get(url, params={"export": "true", **extra}, headers={"Authorization": "Bearer " + admin.token})
        assert r.status_code == 200 and r.content[:2] == b"PK"


def test_receipt_print_and_reprint(admin, client, world):
    w, clerk = world, world["clerk"]
    admin.put("/api/settings/receipt", {"show_medical": True, "footer": "加微信 单号{单号}", "footer_image": "/media/qr.png",
                                        "show_unit_price": False})
    o = _sale(clerk, w, [{"sku_id": w["padp"]["skus"][0]["id"], "qty": 2}], discount_rate=90)
    r = clerk.post(f"/api/orders/{o['id']}/print", {})
    assert r["order_no"] == o["no"] and not r["reprint"]
    assert r["items"][0]["qty"] == 2 and r["items"][0]["unit_price"] is None
    assert ["注册证号", "苏械备20230001"] in [list(x) for x in r["items"][0]["medical"]]
    assert r["footer"] == [f"加微信 单号{o['no']}"] and r["footer_image"] == "/media/qr.png"
    assert "苏械备20230001" in r["text"] and "-6.00" in r["text"]
    # 补打：内容仍来自同一订单
    r2 = clerk.post(f"/api/orders/{o['id']}/print", {"reprint": True})
    assert r2["reprint"] and r2["order_no"] == o["no"] and r2["items"] == r["items"]
    # 没有补打权限的角色不能补打
    role = w["store_role"]
    admin.put(f"/api/roles/{role['id']}", {"name": role["name"], "permissions": [p for p in role["permissions"] if p != "reprint"]})
    clerk.post(f"/api/orders/{o['id']}/print", {"reprint": True}, expect=403)
    # 门店不能改小票设置
    clerk.put("/api/settings/receipt", {"title": "x"}, expect=403)
    pv = admin.post("/api/settings/receipt/preview", {"title": "预览标题"})
    assert pv["head"][0] == "预览标题"
    assert admin.get("/api/settings/receipt")["title"] == "购物小票"


def test_auth(client, admin, world):
    from conftest import login
    assert client.post("/api/auth/login", json={"username": "admin", "password": "bad"}).status_code == 400
    assert client.get("/api/auth/me").status_code == 401
    me = world["clerk"].get("/api/auth/me")
    assert me["stores"] == [{"id": world["s1"]["id"], "name": "一号店"}] and not me["is_admin"]
    # 停用账号后旧登录立即失效
    users = admin.get("/api/users")
    u = next(x for x in users if x["username"] == "clerk1")
    admin.put(f"/api/users/{u['id']}", {"username": "clerk1", "role_id": u["role_id"], "store_ids": [world["s1"]["id"]],
                                        "active": False})
    world["clerk"].get("/api/auth/me", expect=401)
    assert client.post("/api/auth/login", json={"username": "clerk1", "password": "123456"}).status_code == 400
    # 顾客令牌不能调员工接口
    c = customer(client)
    c.get("/api/orders", expect=401)
    assert login


def test_receipt_phone_and_big_area(admin, client, world):
    """配送小票：给顾客电话单独开一行；区域 / 位置（床号）加大加粗。"""
    w = world
    c = customer(client)
    o = c.post("/api/customer/orders", {"area_code": w["a1"]["code"], "location_note": "12 床",
                                        "contact_phone": "13800001234",
                                        "lines": [{"sku_id": w["small"]["id"], "qty": 1}]})
    r = w["clerk"].post(f"/api/orders/{o['id']}/print", {})
    by_label = {row[0]: row for row in r["info"]}
    assert by_label["电话"][1] == "13800001234"
    assert by_label["病区"][2] == "big" and by_label["床号"][2] == "big"
    assert r["style"]["area_size"] == "l" and r["style"]["area_bold"] is True
    assert "电话：13800001234" in r["text"]
    # 关掉开关就不打印电话
    admin.put("/api/settings/receipt", {"show_phone": False})
    r2 = w["clerk"].post(f"/api/orders/{o['id']}/print", {"reprint": True})
    assert all(row[0] != "电话" for row in r2["info"]) and "13800001234" not in r2["text"]
    admin.put("/api/settings/receipt", {"show_phone": True})
    # 没有留电话的订单不打印电话行
    o2 = _sale(w["clerk"], w, [{"sku_id": w["small"]["id"], "qty": 1}])
    r3 = w["clerk"].post(f"/api/orders/{o2['id']}/print", {})
    assert all(row[0] != "电话" for row in r3["info"])
    # 后台预览的示例订单带电话，能直接看到效果
    pv = admin.post("/api/settings/receipt/preview", {})
    assert any(row[0] == "电话" for row in pv["info"])


def test_receipt_area_style_can_be_saved(admin):
    """后台改「区域 / 位置」的字号和加粗后要能存下来，重新读取和预览都用新值。"""
    saved = admin.put("/api/settings/receipt", {"area_size": "m", "area_bold": False})
    assert saved["area_size"] == "m" and saved["area_bold"] is False
    got = admin.get("/api/settings/receipt")
    assert got["area_size"] == "m" and got["area_bold"] is False
    pv = admin.post("/api/settings/receipt/preview", {})
    assert pv["style"]["area_size"] == "m" and pv["style"]["area_bold"] is False


def test_insights_heat_and_areas(client, admin, world):
    from app import db as dbmod
    w = world
    _sale(world["clerk"], w, [{"sku_id": w["small"]["id"], "qty": 1}])
    c = customer(client)
    o = c.post("/api/customer/orders", {"area_code": w["a1"]["code"], "location_note": "1",
                                        "lines": [{"sku_id": w["small"]["id"], "qty": 2}]})
    # 未收款的扫码订单不计入
    r = admin.get("/api/reports/insights")
    assert sum(map(sum, r["heat"])) == 1 and r["areas"] == []
    clerk = world["clerk"]
    clerk.post(f"/api/orders/{o['id']}/accept", {})
    clerk.post(f"/api/orders/{o['id']}/collect", {"payments": [{"method": "cash", "amount": o["payable_amount"]}]})
    r = admin.get("/api/reports/insights")
    now = dbmod.now()
    assert r["heat"][now.weekday()][now.hour] >= 1 and sum(map(sum, r["heat"])) == 2
    assert r["areas"][0]["orders"] == 1 and r["areas"][0]["amount"] == o["payable_amount"]
