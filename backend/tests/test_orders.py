from conftest import customer, stock_of


def place(client, w, lines, area="a1", code="u1", **kw):
    c = customer(client, code)
    body = {"area_code": w[area]["code"], "lines": lines, "location_note": "12床", **kw}
    return c, c.post("/api/customer/orders", body)


def test_area_qr_identifies_store_and_flow(client, admin, world):
    w, clerk = world, world["clerk"]
    loc, cup = w["s1"]["location_id"], w["cup"]["id"]
    info = client.get(f"/api/customer/area/{w['a1']['code']}").json()
    assert info["store_name"] == "一号店" and info["area_name"] == "一病区"
    menu = client.get(f"/api/customer/menu/{w['a1']['code']}").json()
    assert {p["name"] for p in menu["products"]} >= {"杯装水", "冰水"}
    assert "stock_item_id" not in menu["products"][0]["skus"][0]

    c, o = place(client, w, [{"sku_id": w["big"]["id"], "qty": 2}])
    assert (o["store_id"], o["area_name"], o["location_note"], o["status"], o["pay_status"]) == \
        (w["s1"]["id"], "一病区", "12床", "pending", "unpaid")
    # 默认下单即扣库存：大份 2 件 × 2 = 4
    assert stock_of(admin, loc, cup) == 96

    # 门店轮询拿到新订单（提示音、自动打印）
    new = clerk.get("/api/orders/new", store_id=w["s1"]["id"], after_id=0)
    assert [x["id"] for x in new["orders"]] == [o["id"]] and new["pending_count"] == 1
    assert clerk.get("/api/orders/new", store_id=w["s1"]["id"], after_id=new["last_id"])["orders"] == []

    # 接单两次不会重复扣库存
    clerk.post(f"/api/orders/{o['id']}/accept")
    clerk.post(f"/api/orders/{o['id']}/accept")
    assert stock_of(admin, loc, cup) == 96
    # 顾客在接单后不能自己取消
    c.post(f"/api/customer/orders/{o['id']}/cancel", expect=409)
    # 收款（门店收款记账），打 9.5 折
    paid = clerk.post(f"/api/orders/{o['id']}/collect", {"payments": [{"method": "wechat", "amount": 3420}],
                                                         "discount_rate": 95})
    assert (paid["status"], paid["pay_status"], paid["payable_amount"]) == ("completed", "paid", 3420)
    # 重复收款被拒绝
    clerk.post(f"/api/orders/{o['id']}/collect", {"payments": [{"method": "wechat", "amount": 3420}]}, expect=409)
    # 已收款不能直接取消
    clerk.post(f"/api/orders/{o['id']}/cancel", {"reason": "x"}, expect=409)
    assert stock_of(admin, loc, cup) == 96
    mine = c.get("/api/customer/orders")
    assert mine[0]["id"] == o["id"] and mine[0]["pay_status"] == "paid"


def test_other_store_cannot_touch(client, admin, world):
    w, clerk = world, world["clerk"]
    _, o = place(client, w, [{"sku_id": w["small"]["id"], "qty": 1}], area="a2")
    assert o["store_id"] == w["s2"]["id"]
    clerk.post(f"/api/orders/{o['id']}/accept", expect=403)
    clerk.get(f"/api/orders/{o['id']}", expect=403)
    assert all(x["store_id"] == w["s1"]["id"] for x in clerk.get("/api/orders")["items"])
    clerk.get("/api/orders/new", store_id=w["s2"]["id"], expect=403)


def test_cancel_restores_once(client, admin, world):
    w, clerk = world, world["clerk"]
    loc, cup = w["s1"]["location_id"], w["cup"]["id"]
    c, o = place(client, w, [{"sku_id": w["small"]["id"], "qty": 5}])
    assert stock_of(admin, loc, cup) == 95
    c.post(f"/api/customer/orders/{o['id']}/cancel")
    c.post(f"/api/customer/orders/{o['id']}/cancel")
    clerk.post(f"/api/orders/{o['id']}/cancel", {"reason": "重复"})
    assert stock_of(admin, loc, cup) == 100
    # 取消后不能接单或收款
    clerk.post(f"/api/orders/{o['id']}/accept", expect=409)
    clerk.post(f"/api/orders/{o['id']}/collect", {"payments": [{"method": "cash", "amount": 5000}]}, expect=409)
    assert stock_of(admin, loc, cup) == 100


def test_online_rules(client, admin, world):
    w = world
    # 位置必填
    c = customer(client)
    c.post("/api/customer/orders", {"area_code": w["a1"]["code"], "lines": [{"sku_id": w["small"]["id"], "qty": 1}]},
           expect=400)
    # 小程序默认不允许超卖
    c.post("/api/customer/orders", {"area_code": w["a1"]["code"], "location_note": "1",
                                    "lines": [{"sku_id": w["big"]["id"], "qty": 51}]}, expect=409)
    # 顾客端不可见的商品不能下单
    p = w["ice"]
    admin.put(f"/api/products/{p['id']}", {"name": p["name"], "online_visible": False, "skus": p["skus"]})
    c.post("/api/customer/orders", {"area_code": w["a1"]["code"], "location_note": "1",
                                    "lines": [{"sku_id": p["skus"][0]["id"], "qty": 1}]}, expect=400)
    # 二维码重置后旧码失效
    admin.post(f"/api/areas/{w['a1']['id']}/reset-code")
    client.get(f"/api/customer/area/{w['a1']['code']}").status_code == 404
    assert client.get(f"/api/customer/area/{w['a1']['code']}").status_code == 404
    # 同一请求号重复提交只生成一单
    body = {"area_code": w["a2"]["code"], "location_note": "3", "request_id": "w-1",
            "lines": [{"sku_id": w["small"]["id"], "qty": 1}]}
    assert c.post("/api/customer/orders", body)["id"] == c.post("/api/customer/orders", body)["id"]


def test_deduct_on_accept_setting(client, admin, world):
    w, clerk = world, world["clerk"]
    loc, cup = w["s1"]["location_id"], w["cup"]["id"]
    admin.put("/api/settings/rules", {"online_deduct_on": "accept"})
    c, o = place(client, w, [{"sku_id": w["small"]["id"], "qty": 4}])
    assert stock_of(admin, loc, cup) == 100
    clerk.post(f"/api/orders/{o['id']}/accept")
    assert stock_of(admin, loc, cup) == 96
    clerk.post(f"/api/orders/{o['id']}/cancel")
    assert stock_of(admin, loc, cup) == 100


def test_refunds(client, admin, world):
    w, clerk = world, world["clerk"]
    loc, cup = w["s1"]["location_id"], w["cup"]["id"]
    o = clerk.post("/api/pos/checkout", {"store_id": w["s1"]["id"], "payable": 2500,
                                         "lines": [{"sku_id": w["small"]["id"], "qty": 1}, {"sku_id": w["big"]["id"], "qty": 1}],
                                         "payments": [{"method": "cash", "amount": 2500}]})
    assert stock_of(admin, loc, cup) == 97
    small_item = next(i for i in o["items"] if i["sku_id"] == w["small"]["id"])
    big_item = next(i for i in o["items"] if i["sku_id"] == w["big"]["id"])
    assert small_item["paid_share"] + big_item["paid_share"] == 2500
    # 退 1 份大份，回库存 2 个纸杯；按实收分摊退款
    r = clerk.post(f"/api/orders/{o['id']}/refund", {"lines": [{"order_item_id": big_item["id"], "qty": 1}],
                                                     "request_id": "rf-1"})
    assert r["refund"]["amount"] == big_item["paid_share"]
    assert r["order"]["pay_status"] == "partial_refunded"
    assert stock_of(admin, loc, cup) == 99
    # 重复提交同一退款请求不重复退
    clerk.post(f"/api/orders/{o['id']}/refund", {"lines": [{"order_item_id": big_item["id"], "qty": 1}],
                                                 "request_id": "rf-1"})
    assert stock_of(admin, loc, cup) == 99
    # 已经退完的商品不能再退
    clerk.post(f"/api/orders/{o['id']}/refund", {"lines": [{"order_item_id": big_item["id"], "qty": 1}]}, expect=400)
    # 损坏品退款但不回库存
    r = clerk.post(f"/api/orders/{o['id']}/refund", {"lines": [{"order_item_id": small_item["id"], "qty": 1}],
                                                     "restock": False})
    assert r["order"]["pay_status"] == "refunded" and r["order"]["refunded_amount"] == 2500
    assert stock_of(admin, loc, cup) == 99
    # 全额退完后不能再退
    clerk.post(f"/api/orders/{o['id']}/refund", {"lines": [{"order_item_id": small_item["id"], "qty": 1}]}, expect=409)
    d = clerk.get(f"/api/orders/{o['id']}")
    assert len(d["refunds"]) == 2 and [p["kind"] for p in d["payments"]] == ["pay", "refund", "refund"]


def test_refund_needs_permission_and_payment(client, admin, world):
    w, clerk = world, world["clerk"]
    _, o = place(client, w, [{"sku_id": w["small"]["id"], "qty": 1}])
    item = o["items"][0]
    # 未收款不能退款
    clerk.post(f"/api/orders/{o['id']}/refund", {"lines": [{"order_item_id": item["id"], "qty": 1}]}, expect=409)
    role = w["store_role"]
    admin.put(f"/api/roles/{role['id']}", {"name": role["name"], "permissions": [p for p in role["permissions"] if p != "refund"]})
    clerk.post(f"/api/orders/{o['id']}/collect", {"payments": [{"method": "cash", "amount": 1000}]})
    clerk.post(f"/api/orders/{o['id']}/refund", {"lines": [{"order_item_id": item["id"], "qty": 1}]}, expect=403)
