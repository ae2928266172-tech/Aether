"""售后换货（2026-11-22 Aether）：拿 A 换 B，可跨商品、部分换、一换多；按原实收算旧商品、现价算新商品，多退少补；
旧商品完好回可售库存、拆封破损进残次品库；新商品出库跳过过期批次；原订单行不改，换货单独立记账；防重复；换货凭证。"""
import datetime as dt

from conftest import stock_of


def ex(api, oid, returns, items, expect=200, **kw):
    import uuid
    body = {"returns": [{"order_item_id": i, "qty": q} for i, q in returns],
            "items": [{"sku_id": s, "qty": q} for s, q in items], "request_id": kw.pop("request_id", uuid.uuid4().hex), **kw}
    return api.post(f"/api/orders/{oid}/exchange", body, expect=expect)


def checkout(api, w, lines, amount, **kw):
    return api.post("/api/pos/checkout", {"store_id": w["s1"]["id"], "lines": [{"sku_id": s, "qty": q} for s, q in lines],
                                          "payments": [{"method": "cash", "amount": amount}], **kw})


def test_cross_product_exchange_pay_and_refund(client, admin, world):
    w, clerk = world, world["clerk"]
    loc, cup = w["s1"]["location_id"], w["cup"]["id"]
    clerk.post("/api/shifts/open", {"store_id": w["s1"]["id"], "opening_cash": 0})
    o = checkout(clerk, w, [(w["small"]["id"], 3)], 3000)
    assert stock_of(admin, loc, cup) == 97
    it = o["items"][0]["id"]
    # 3 件小份里拿 1 件换 2 杯冰水（跨商品、一换多）：旧 10 元，新 2×5=10 元，平价换
    r = ex(clerk, o["id"], [(it, 1)], [(w["ice"]["skus"][0]["id"], 2)], method="wechat")
    assert r["exchange"]["no"].startswith("H") and r["exchange"]["diff"] == 0
    assert stock_of(admin, loc, cup) == 96  # 回 1 扣 2
    # 再拿 2 件小份换 2 件大份：补 16 元（微信）
    r = ex(clerk, o["id"], [(it, 2)], [(w["big"]["id"], 2)], method="wechat")
    assert r["exchange"]["diff"] == 1600 and r["order"]["paid_amount"] == 4600
    assert stock_of(admin, loc, cup) == 94  # 回 2 扣 4
    # 原行不改不删，只记已退换 3 件
    orig = next(i for i in r["order"]["items"] if i["id"] == it)
    assert (orig["qty"], orig["refunded_qty"], orig["paid_share"]) == (3, 3, 3000)
    # 超量：原单这一行已经没有可换的了
    ex(clerk, o["id"], [(it, 1)], [(w["big"]["id"], 1)], expect=400)
    # 大份 1 件换回小份：退 8 元，退款权限有；退差价默认回原支付方式（现金）
    big = next(i for i in r["order"]["items"] if i["sku_name"] == "大份")
    r = ex(clerk, o["id"], [(big["id"], 1)], [(w["small"]["id"], 1)])
    assert r["exchange"]["diff"] == -800 and r["exchange"]["method"] == "cash" and r["order"]["refunded_amount"] == 800
    # 交班单列换货补差 / 退差
    sm = clerk.get(f"/api/shifts/current?store_id={w['s1']['id']}")["shift"]
    assert (sm["exchange_pay"], sm["exchange_refund"]) == (1600, 800)
    # 换完照常退货：剩下的全部退完，金额正好等于实收
    o2 = clerk.get(f"/api/orders/{o['id']}")
    lines = [{"order_item_id": i["id"], "qty": i["qty"] - i["refunded_qty"]} for i in o2["items"] if i["qty"] > i["refunded_qty"]]
    rf = clerk.post(f"/api/orders/{o['id']}/refund", {"lines": lines})
    assert rf["refund"]["amount"] == 4600 - 800 and rf["order"]["pay_status"] == "refunded"
    assert stock_of(admin, loc, cup) == 100
    assert len(o2["exchanges"]) == 3


def test_discounted_order_uses_actual_paid(client, admin, world):
    """原价 100 打 5 折实收 50，换 40 元商品：按实收 50 算，退 10，不会退 60 倒贴。"""
    w = world
    p = admin.post("/api/products", {"name": "护理裤", "skus": [{"name": "L", "price": 10000}, {"name": "S", "price": 4000}]})
    L, S = (next(k["id"] for k in p["skus"] if k["name"] == n) for n in ("L", "S"))
    o = admin.post("/api/pos/checkout", {"store_id": w["s1"]["id"], "lines": [{"sku_id": L, "qty": 1}], "discount_rate": 50,
                                         "payments": [{"method": "cash", "amount": 5000}]})
    it = o["items"][0]["id"]
    q = admin.post(f"/api/orders/{o['id']}/exchange/quote", {"returns": [{"order_item_id": it, "qty": 1}],
                                                             "items": [{"sku_id": S, "qty": 1}]})
    assert (q["old_amount"], q["new_amount"], q["diff"]) == (5000, 4000, -1000)
    r = ex(admin, o["id"], [(it, 1)], [(S, 1)], request_id="same-1")
    assert r["order"]["refunded_amount"] == 1000
    # 断网重试同一个请求号：不会再换一次、再退一次
    r2 = ex(admin, o["id"], [(it, 1)], [(S, 1)], request_id="same-1")
    assert r2["exchange"]["id"] == r["exchange"]["id"] and r2["order"]["refunded_amount"] == 1000
    assert len(r2["order"]["items"]) == 2
    # 没有请求号直接拒绝
    admin.post(f"/api/orders/{o['id']}/exchange", {"returns": [{"order_item_id": it, "qty": 1}],
                                                   "items": [{"sku_id": S, "qty": 1}]}, expect=400)


def test_lower_new_amount_needs_permission(client, admin, world):
    w, clerk = world, world["clerk"]
    o = checkout(clerk, w, [(w["small"]["id"], 1)], 1000)
    it = o["items"][0]["id"]
    # 店员单笔最多调低 5 元：不能把换出的大份 18 元调成 10 元
    u = next(x for x in admin.get("/api/users") if x["username"] == "clerk1")
    admin.put(f"/api/users/{u['id']}", {"username": "clerk1", "display_name": "店员甲", "role_id": u["role_id"],
                                       "store_ids": [w["s1"]["id"]], "max_adjust_amount": 500})
    ex(clerk, o["id"], [(it, 1)], [(w["big"]["id"], 1)], new_amount=1000, expect=403)
    r = ex(admin, o["id"], [(it, 1)], [(w["big"]["id"], 1)], new_amount=1000)
    assert r["exchange"]["diff"] == 0 and r["exchange"]["new_original"] == 1800


def test_defective_return_goes_to_isolation(client, admin, world):
    """拆封 / 破损的退回商品进残次品库，不回可售库存。"""
    w, clerk = world, world["clerk"]
    loc, pad = w["s1"]["location_id"], w["pad"]["id"]
    sku = w["padp"]["skus"][0]
    o = checkout(clerk, w, [(sku["id"], 2)], 6000)
    assert stock_of(admin, loc, pad) == 80
    r = ex(clerk, o["id"], [(o["items"][0]["id"], 1)], [(sku["id"], 1)], condition="defective")
    assert r["exchange"]["condition"] == "defective"
    assert stock_of(admin, loc, pad) == 70  # 没有回 10，又扣 10
    bad = next(l for l in admin.get("/api/locations") if l["kind"] == "defective")
    assert stock_of(admin, bad["id"], pad) == 10
    ex(clerk, o["id"], [(o["items"][0]["id"], 1)], [(sku["id"], 1)], condition="whatever", expect=400)


def test_exchange_keeps_history_and_prints_voucher(client, admin, world):
    from app import db as dbmod
    from app.models import Order
    w = world
    o = checkout(admin, w, [(w["small"]["id"], 2)], 2000)
    past = dt.datetime.now() - dt.timedelta(days=3)
    with dbmod.SessionLocal() as s:
        s.get(Order, o["id"]).paid_at = past
        s.commit()
    day = past.date().isoformat()
    before = admin.get(f"/api/reports/revenue?begin={day}&end={day}")["total"]
    r = ex(admin, o["id"], [(o["items"][0]["id"], 1)], [(w["ice"]["skus"][0]["id"], 1)], method="cash")
    after = admin.get(f"/api/reports/revenue?begin={day}&end={day}")["total"]
    assert (after["qty"], after["cost"], after["original"], after["received"]) == \
           (before["qty"], before["cost"], before["original"], before["received"])
    today = dt.date.today().isoformat()
    rows = admin.get(f"/api/reports/product-sales/detail?begin={today}&end={today}")["rows"]
    assert {x["type_text"] for x in rows} >= {"换货换出", "换货退回"}
    # 换货凭证：原单号、退回、换出、差价
    rc = r["receipt"]
    assert rc["title"] == "售后换货凭证" and ["原单号", o["no"]] in rc["info"]
    assert any(i["name"].startswith("【退回】") for i in rc["items"]) and any(i["name"].startswith("【换出】") for i in rc["items"])
    assert ["退还（现金）", "5.00"] in rc["totals"]
    # 补打
    rp = admin.post(f"/api/exchanges/{r['exchange']['id']}/print", {})
    assert rp["reprint"] is True
