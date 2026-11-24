"""请求号（防重复提交）只认同一个人、同一家店、同一张单、同样的内容。"""
from conftest import customer


def sale(w, sku, qty=1, rid="r-1", store="s1"):
    return {"store_id": w[store]["id"], "lines": [{"sku_id": w[sku]["id"], "qty": qty}],
            "payments": [{"method": "cash", "amount": (1000 if sku == "small" else 1800) * qty}], "request_id": rid}


def test_checkout_request_id_belongs_to_its_owner(admin, world):
    w = world
    first = admin.post("/api/pos/checkout", sale(w, "small"))
    assert admin.post("/api/pos/checkout", sale(w, "small"))["id"] == first["id"], "同一请求重发拿到原单"
    # 别人拿同一个请求号：不能看到这张单
    r = w["clerk"].post("/api/pos/checkout", sale(w, "small"), expect=409)
    assert "请求号" in r["detail"]
    # 自己用同一个请求号买别的东西 / 换门店：也不能返回原单
    admin.post("/api/pos/checkout", sale(w, "big"), expect=409)
    admin.post("/api/pos/checkout", sale(w, "small", qty=2), expect=409)
    admin.post("/api/pos/checkout", sale(w, "small", store="s2"), expect=409)


def test_refund_request_id_belongs_to_its_order(admin, world):
    w = world
    o1 = admin.post("/api/pos/checkout", sale(w, "small", qty=2, rid="a"))
    o2 = admin.post("/api/pos/checkout", sale(w, "small", qty=2, rid="b"))
    body = lambda o, q=1: {"lines": [{"order_item_id": o["items"][0]["id"], "qty": q}], "request_id": "rf-1"}
    first = admin.post(f"/api/orders/{o1['id']}/refund", body(o1))["refund"]
    assert admin.post(f"/api/orders/{o1['id']}/refund", body(o1))["refund"]["id"] == first["id"]
    admin.post(f"/api/orders/{o2['id']}/refund", body(o2), expect=409)  # 换一张单
    admin.post(f"/api/orders/{o1['id']}/refund", body(o1, 2), expect=409)  # 换数量
    assert admin.get(f"/api/orders/{o2['id']}")["refunded_amount"] == 0


def test_stock_doc_request_id_belongs_to_its_content(admin, world):
    w = world
    doc = {"kind": "in", "to_location_id": w["wh"]["id"], "request_id": "d-1",
           "lines": [{"stock_item_id": w["cup"]["id"], "qty": 5}]}
    first = admin.post("/api/stock-docs", doc)
    assert admin.post("/api/stock-docs", doc)["id"] == first["id"]
    admin.post("/api/stock-docs", {**doc, "lines": [{"stock_item_id": w["cup"]["id"], "qty": 6}]}, expect=409)
    admin.post("/api/stock-docs", {**doc, "to_location_id": w["s1"]["location_id"]}, expect=409)


def test_collect_request_id_returns_paid_order(client, world):
    """线上单收款：网络重试带同一个请求号时返回已收款的原单，不报错、不重复记账。"""
    w = world
    o = customer(client).post("/api/customer/orders", {
        "area_code": w["a1"]["code"], "location_note": "1",
        "lines": [{"sku_id": w["small"]["id"], "qty": 1}]})
    body = {"payments": [{"method": "cash", "amount": o["payable_amount"]}], "request_id": "pay-1"}
    first = w["clerk"].post(f"/api/orders/{o['id']}/collect", body)
    assert first["pay_status"] == "paid"
    again = w["clerk"].post(f"/api/orders/{o['id']}/collect", body)
    assert again["id"] == first["id"] and again["paid_amount"] == first["paid_amount"]
    pays = [p for p in w["clerk"].get(f"/api/orders/{o['id']}")["payments"] if p["kind"] == "pay"]
    assert len(pays) == 1, "同一个请求号重发不能重复记一笔收款"
    r = w["clerk"].post(f"/api/orders/{o['id']}/collect", {**body, "request_id": "pay-2"}, expect=409)
    assert "已收款" in r["detail"]
    # 不带请求号时行为不变
    w["clerk"].post(f"/api/orders/{o['id']}/collect", {"payments": body["payments"]}, expect=409)


def test_collect_request_id_checks_content(client, admin, world):
    """收款请求号相同但内容变了（付款方式 / 金额 / 操作人 / 折扣），不能当成重复请求返回原单。"""
    w = world
    o = customer(client).post("/api/customer/orders", {
        "area_code": w["a1"]["code"], "location_note": "1",
        "lines": [{"sku_id": w["small"]["id"], "qty": 1}]})
    amt = o["payable_amount"]
    body = {"payments": [{"method": "cash", "amount": amt}], "request_id": "pay-c"}
    first = w["clerk"].post(f"/api/orders/{o['id']}/collect", body)
    assert first["pay_status"] == "paid"
    # 同一个请求号，第一次现金、第二次改成微信：账上还是现金，不能返回 200
    r = w["clerk"].post(f"/api/orders/{o['id']}/collect",
                        {**body, "payments": [{"method": "wechat", "amount": amt}]}, expect=409)
    assert "请求号" in r["detail"]
    # 改金额
    w["clerk"].post(f"/api/orders/{o['id']}/collect",
                    {**body, "payments": [{"method": "cash", "amount": amt + 100}]}, expect=409)
    # 换一个账号重试
    admin.post(f"/api/orders/{o['id']}/collect", body, expect=409)
    # 原样重试仍返回原单，且只有一笔收款，方式仍是现金
    again = w["clerk"].post(f"/api/orders/{o['id']}/collect", body)
    assert again["id"] == first["id"] and again["paid_amount"] == first["paid_amount"]
    pays = [p for p in w["clerk"].get(f"/api/orders/{o['id']}")["payments"] if p["kind"] == "pay"]
    assert len(pays) == 1 and pays[0]["method"] == "cash"

    # 折扣 / 应收变了也不行
    o2 = customer(client).post("/api/customer/orders", {
        "area_code": w["a1"]["code"], "location_note": "1",
        "lines": [{"sku_id": w["small"]["id"], "qty": 1}]})
    b2 = {"payments": [{"method": "cash", "amount": 950}], "discount_rate": 95, "request_id": "pay-d"}
    admin.post(f"/api/orders/{o2['id']}/collect", b2)
    admin.post(f"/api/orders/{o2['id']}/collect", {**b2, "discount_rate": 90}, expect=409)
    admin.post(f"/api/orders/{o2['id']}/collect", {**b2, "payable": 940}, expect=409)
    assert admin.post(f"/api/orders/{o2['id']}/collect", b2)["id"] == o2["id"]
