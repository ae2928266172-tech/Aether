"""2026-11-21：未收款订单直接改单（换规格、改数量、去掉/添加商品）；退款期限（默认 14 天，管理员不限）；折扣不限时可打到 0 元。"""
from datetime import timedelta

from conftest import customer, stock_of


def place(client, w, lines):
    c = customer(client, "u1")
    return c.post("/api/customer/orders", {"area_code": w["a1"]["code"], "lines": lines, "location_note": "3床"})


def test_modify_unpaid_online_order(client, admin, world):
    w, clerk = world, world["clerk"]
    loc, cup = w["s1"]["location_id"], w["cup"]["id"]
    o = place(client, w, [{"sku_id": w["small"]["id"], "qty": 2}, {"sku_id": w["ice"]["skus"][0]["id"], "qty": 1}])
    assert stock_of(admin, loc, cup) == 97  # 小份 2×1 + 冰水 1×1
    # 小份 2 件换成大份 1 件、去掉冰水、加 1 包护理垫
    m = clerk.post(f"/api/orders/{o['id']}/modify", {"lines": [
        {"sku_id": w["big"]["id"], "qty": 1}, {"sku_id": w["padp"]["skus"][0]["id"], "qty": 1}], "reason": "换尺码"})
    assert sorted((i["sku_name"], i["qty"]) for i in m["items"]) == [("10片装", 1), ("大份", 1)]
    assert (m["original_amount"], m["payable_amount"], m["pay_status"]) == (4800, 4800, "unpaid")
    assert stock_of(admin, loc, cup) == 98  # 退回 3 个，再扣大份 2 个
    assert stock_of(admin, loc, w["pad"]["id"]) == 90
    logs = clerk.get(f"/api/orders/{o['id']}")["logs"]
    assert any(l["action"] == "改单" and "换尺码" in l["detail"] for l in logs)
    # 没变化、清空都被拒绝
    clerk.post(f"/api/orders/{o['id']}/modify", {"lines": [{"sku_id": w["big"]["id"], "qty": 1},
                                                            {"sku_id": w["padp"]["skus"][0]["id"], "qty": 1}]}, expect=400)
    clerk.post(f"/api/orders/{o['id']}/modify", {"lines": []}, expect=400)
    # 改完照常收款；取消也只按改后的商品退库存
    clerk.post(f"/api/orders/{o['id']}/collect", {"payments": [{"method": "cash", "amount": 4800}]})
    clerk.post(f"/api/orders/{o['id']}/modify", {"lines": [{"sku_id": w["big"]["id"], "qty": 2}]}, expect=409)


def test_modify_then_cancel_restores_new_items(client, admin, world):
    w, clerk = world, world["clerk"]
    loc, cup = w["s1"]["location_id"], w["cup"]["id"]
    o = place(client, w, [{"sku_id": w["small"]["id"], "qty": 1}])
    clerk.post(f"/api/orders/{o['id']}/modify", {"lines": [{"sku_id": w["big"]["id"], "qty": 3}]})
    assert stock_of(admin, loc, cup) == 94
    clerk.post(f"/api/orders/{o['id']}/cancel", {"reason": ""})
    assert stock_of(admin, loc, cup) == 100
    clerk.post(f"/api/orders/{o['id']}/modify", {"lines": [{"sku_id": w["big"]["id"], "qty": 1}]}, expect=409)


def test_refund_days_limit(client, admin, world):
    from app.db import SessionLocal, now
    from app.models import Order
    w, clerk = world, world["clerk"]
    assert admin.get("/api/settings/rules")["refund_days"] == 14
    o = clerk.post("/api/pos/checkout", {"store_id": w["s1"]["id"], "lines": [{"sku_id": w["small"]["id"], "qty": 2}],
                                         "payments": [{"method": "cash", "amount": 2000}]})
    with SessionLocal() as db:
        db.get(Order, o["id"]).paid_at = now() - timedelta(days=15)
        db.commit()
    line = [{"order_item_id": o["items"][0]["id"], "qty": 1}]
    r = clerk.post(f"/api/orders/{o['id']}/refund", {"lines": line}, expect=403)
    assert "14 天" in r["detail"]
    admin.post(f"/api/orders/{o['id']}/refund", {"lines": line})  # 管理员不受限
    admin.put("/api/settings/rules", {"refund_days": 0})  # 0 = 不限
    clerk.post(f"/api/orders/{o['id']}/refund", {"lines": line})
    admin.put("/api/settings/rules", {"refund_days": -1}, expect=400)


def test_discount_to_zero(client, admin, world):
    w, clerk = world, world["clerk"]
    lines = [{"sku_id": w["small"]["id"], "qty": 1}]
    assert clerk.post("/api/pos/quote", {"lines": lines, "payable": 0})["payable_amount"] == 0
    assert clerk.post("/api/pos/quote", {"lines": lines, "discount_rate": 0})["payable_amount"] == 0
    o = clerk.post("/api/pos/checkout", {"store_id": w["s1"]["id"], "lines": lines, "payable": 0,
                                         "payments": [{"method": "cash", "amount": 0}]})
    assert (o["payable_amount"], o["pay_status"]) == (0, "paid")
    # 设了最低折扣的账号仍然受限
    role = w["store_role"]
    admin.put(f"/api/roles/{role['id']}", {"name": role["name"], "is_admin": False, "permissions": role["permissions"],
                                           "min_discount_rate": 80, "max_adjust_amount": None})
    clerk.post("/api/pos/quote", {"lines": lines, "payable": 0}, expect=403)
