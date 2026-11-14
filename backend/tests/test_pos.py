from conftest import stock_of


def checkout(api, w, lines, payments=None, **kw):
    body = {"store_id": w["s1"]["id"], "lines": lines, **kw}
    if payments is None:
        q = api.post("/api/pos/quote", {"lines": lines, **{k: v for k, v in kw.items() if k in ("discount_rate", "payable")}})
        payments = [{"method": "wechat", "amount": q["payable_amount"]}]
    body["payments"] = payments
    return body


def test_shared_stock_deduct_qty(admin, world):
    w, clerk = world, world["clerk"]
    loc, cup = w["s1"]["location_id"], w["cup"]["id"]
    lines = [{"sku_id": w["small"]["id"], "qty": 3}, {"sku_id": w["big"]["id"], "qty": 2},
             {"sku_id": w["ice"]["skus"][0]["id"], "qty": 1}]
    o = clerk.post("/api/pos/checkout", checkout(clerk, w, lines))
    assert o["status"] == "completed" and o["pay_status"] == "paid"
    assert o["original_amount"] == 3 * 1000 + 2 * 1800 + 500
    # 小份扣 1、大份扣 2、冰水扣 1：3 + 4 + 1 = 8
    assert stock_of(admin, loc, cup) == 92


def test_discount_and_adjust_only_this_order(admin, world):
    w, clerk = world, world["clerk"]
    lines = [{"sku_id": w["small"]["id"], "qty": 10}]  # 原价 100 元
    o = clerk.post("/api/pos/checkout", checkout(clerk, w, lines, payable=9500))
    assert (o["original_amount"], o["payable_amount"], o["discount_amount"]) == (10000, 9500, 500)
    # 库存照实际件数扣
    assert stock_of(admin, w["s1"]["location_id"], w["cup"]["id"]) == 90
    # 下一单仍按原价
    o2 = clerk.post("/api/pos/checkout", checkout(clerk, w, lines))
    assert o2["payable_amount"] == 10000
    assert admin.get(f"/api/products/{w['water']['id']}")["skus"][0]["price"] == 1000
    # 打 9 折后再抹零
    o3 = clerk.post("/api/pos/checkout", checkout(clerk, w, [{"sku_id": w["big"]["id"], "qty": 3}],
                                                  discount_rate=90, payable=4800))
    assert (o3["original_amount"], o3["discount_rate"], o3["payable_amount"]) == (5400, 90, 4800)
    # 只能调低，不能调高
    clerk.post("/api/pos/quote", {"lines": lines, "payable": 10001}, expect=400)
    clerk.post("/api/pos/quote", {"lines": lines, "discount_rate": 90, "payable": 9100}, expect=400)


def test_discount_permission(admin, client, world):
    w = world
    roles = admin.get("/api/roles")
    r = admin.post("/api/roles", {"name": "只收银", "permissions": ["pos"]})
    admin.post("/api/users", {"username": "c2", "role_id": r["id"], "store_ids": [w["s1"]["id"]], "password": "123456"})
    from conftest import login
    c2 = login(client, "c2", "123456")
    lines = [{"sku_id": w["small"]["id"], "qty": 1}]
    c2.post("/api/pos/quote", {"lines": lines, "discount_rate": 90}, expect=403)
    c2.post("/api/pos/quote", {"lines": lines, "payable": 900}, expect=403)
    c2.post("/api/pos/checkout", checkout(c2, w, lines))
    # 门店角色不能勾后台权限
    admin.post("/api/roles", {"name": "坏角色", "permissions": ["reports"]}, expect=400)
    assert roles


def test_discount_limits(admin, client, world):
    """角色设最低 8 折、单笔最多抹 5 元；账号单独设置优先于角色。"""
    w = world
    role = w["store_role"]
    admin.put(f"/api/roles/{role['id']}", {"name": role["name"], "permissions": role["permissions"],
                                            "min_discount_rate": 80, "max_adjust_amount": 500})
    clerk = w["clerk"]
    lines = [{"sku_id": w["small"]["id"], "qty": 10}]  # 原价 100 元
    clerk.post("/api/pos/quote", {"lines": lines, "discount_rate": 80})
    clerk.post("/api/pos/quote", {"lines": lines, "discount_rate": 79}, expect=403)
    clerk.post("/api/pos/quote", {"lines": lines, "payable": 9500})
    clerk.post("/api/pos/quote", {"lines": lines, "payable": 9499}, expect=403)
    # 8 折后再抹零也不能低于 8 折
    clerk.post("/api/pos/quote", {"lines": lines, "discount_rate": 80, "payable": 7999}, expect=403)
    # 小程序订单收款时同样受限
    from conftest import customer
    c = customer(client)
    o = c.post("/api/customer/orders", {"area_code": w["a1"]["code"], "location_note": "1", "lines": lines})
    clerk.post(f"/api/orders/{o['id']}/collect", {"payments": [{"method": "cash", "amount": 7000}], "discount_rate": 70},
               expect=403)
    # 给这个账号单独放宽到 7 折
    u = next(x for x in admin.get("/api/users") if x["username"] == "clerk1")
    admin.put(f"/api/users/{u['id']}", {"username": "clerk1", "role_id": u["role_id"], "store_ids": [w["s1"]["id"]],
                                        "min_discount_rate": 70})
    clerk.post(f"/api/orders/{o['id']}/collect", {"payments": [{"method": "cash", "amount": 7000}], "discount_rate": 70})
    # 管理员默认不限
    admin.post("/api/pos/quote", {"lines": lines, "discount_rate": 10})


def test_idempotent_and_payment_checks(admin, world):
    w, clerk = world, world["clerk"]
    lines = [{"sku_id": w["small"]["id"], "qty": 1}]
    body = checkout(clerk, w, lines, payments=[{"method": "cash", "amount": 1000, "received": 2000}], request_id="pos-1")
    o1 = clerk.post("/api/pos/checkout", body)
    o2 = clerk.post("/api/pos/checkout", body)
    assert o1["id"] == o2["id"]
    assert o1["payments"][0]["change"] == 1000
    assert stock_of(admin, w["s1"]["location_id"], w["cup"]["id"]) == 99
    # 收款合计必须等于应收
    clerk.post("/api/pos/checkout", checkout(clerk, w, lines, payments=[{"method": "cash", "amount": 900}]), expect=400)
    clerk.post("/api/pos/checkout", checkout(clerk, w, lines, payments=[{"method": "cash", "amount": 1000, "received": 500}]),
               expect=400)
    # 组合收款
    clerk.post("/api/pos/checkout", checkout(clerk, w, lines, payments=[{"method": "cash", "amount": 400},
                                                                       {"method": "wechat", "amount": 600}]))
    # 不能在没绑定的门店收银
    b = checkout(clerk, w, lines)
    b["store_id"] = w["s2"]["id"]
    clerk.post("/api/pos/checkout", b, expect=403)


def test_barcode_and_negative_stock_rule(admin, world):
    w, clerk = world, world["clerk"]
    r = clerk.get("/api/products/by-barcode/690002")
    assert r["sku_id"] == w["big"]["id"]
    assert "cost" not in r["product"]["skus"][0]
    clerk.get("/api/products/by-barcode/nope", expect=404)
    # 默认：门店收银允许卖成负数
    o = clerk.post("/api/pos/checkout", checkout(clerk, w, [{"sku_id": w["big"]["id"], "qty": 60}]))
    assert stock_of(admin, w["s1"]["location_id"], w["cup"]["id"]) == -20
    # 关掉后库存不足会被拒绝
    admin.put("/api/settings/rules", {"pos_allow_negative": False})
    clerk.post("/api/pos/checkout", checkout(clerk, w, [{"sku_id": w["small"]["id"], "qty": 1}]), expect=409)
    assert o["id"]


def test_shift_summary(admin, world):
    w, clerk = world, world["clerk"]
    lines = [{"sku_id": w["small"]["id"], "qty": 1}]
    clerk.post("/api/pos/checkout", checkout(clerk, w, lines, payments=[{"method": "cash", "amount": 1000}]))
    clerk.post("/api/pos/checkout", checkout(clerk, w, lines, payments=[{"method": "wechat", "amount": 1000}]))
    s = clerk.get("/api/pos/summary", store_id=w["s1"]["id"])
    assert s["methods"]["cash"]["pay"] == 1000 and s["methods"]["wechat"]["pay"] == 1000 and s["net"] == 2000
