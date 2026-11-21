"""请求号（防重复提交）只认同一个人、同一家店、同一张单、同样的内容。"""


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
