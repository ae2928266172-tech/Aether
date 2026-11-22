"""批次与有效期：入库录批号、生产日期、有效期至；先到期先出；调拨批次跟着走；临期提醒。"""
from datetime import date, timedelta

from conftest import stock_of


def d(n):
    return (date.today() + timedelta(days=n)).isoformat()


def batch_qty(admin, location_id, item_id):
    return {(b["batch_no"], b["expiry_date"]): b["qty"]
            for b in admin.get("/api/stock-batches", location_id=location_id, stock_item_id=item_id)}


def setup_batches(admin, world):
    wh, pad = world["wh"], world["pad"]
    # 护理垫入库两批：A 批 20 天后到期 30 片，B 批 200 天后到期 50 片（同一张单分两行）
    doc = admin.post("/api/stock-docs", {"kind": "in", "to_location_id": wh["id"], "lines": [
        {"stock_item_id": pad["id"], "qty": 50, "batch_no": "B", "production_date": d(-10), "expiry_date": d(200)},
        {"stock_item_id": pad["id"], "qty": 30, "batch_no": "A", "production_date": d(-300), "expiry_date": d(20)}]})
    return doc


def test_in_doc_batches_and_fifo_transfer(admin, world):
    wh, s1, pad = world["wh"], world["s1"], world["pad"]
    doc = setup_batches(admin, world)
    assert sorted((ln["batch_no"], ln["qty"]) for ln in doc["lines"]) == [("A", 30), ("B", 50)]
    assert batch_qty(admin, wh["id"], pad["id"]) == {("A", d(20)): 30, ("B", d(200)): 50}
    # 调拨 40 片到一号店：先出 A 批 30，再出 B 批 10，批次跟着到门店
    t = admin.post("/api/stock-docs", {"kind": "transfer", "from_location_id": wh["id"],
                                       "to_location_id": s1["location_id"],
                                       "lines": [{"stock_item_id": pad["id"], "qty": 40}]})
    assert batch_qty(admin, wh["id"], pad["id"]) == {("B", d(200)): 40}
    assert batch_qty(admin, s1["location_id"], pad["id"]) == {("A", d(20)): 30, ("B", d(200)): 10}
    # 门店库存列表带出最早有效期
    row = next(r for r in admin.get("/api/stock", location_id=s1["location_id"]) if r["stock_item_id"] == pad["id"])
    assert row["earliest_expiry"] == d(20)
    # 作废调拨：批次也原样回到仓库
    admin.post(f"/api/stock-docs/{t['id']}/void", {"reason": "调错"})
    assert batch_qty(admin, wh["id"], pad["id"]) == {("A", d(20)): 30, ("B", d(200)): 50}
    assert batch_qty(admin, s1["location_id"], pad["id"]) == {}
    # 作废入库单：两个批次都清掉
    admin.post(f"/api/stock-docs/{doc['id']}/void", {"reason": "录错"})
    assert batch_qty(admin, wh["id"], pad["id"]) == {}


def test_sale_and_refund_use_batches(admin, world):
    wh, s1, pad, clerk = world["wh"], world["s1"], world["pad"], world["clerk"]
    setup_batches(admin, world)
    admin.post("/api/stock-docs", {"kind": "transfer", "from_location_id": wh["id"],
                                   "to_location_id": s1["location_id"],
                                   "lines": [{"stock_item_id": pad["id"], "qty": 40}]})
    # 一号店原来就有 100 片无批次的护理垫；卖 2 包（每包扣 10 片）= 20 片，先扣最早到期的 A 批
    sku = world["padp"]["skus"][0]
    o = clerk.post("/api/pos/checkout", {"store_id": s1["id"], "lines": [{"sku_id": sku["id"], "qty": 2}],
                                         "payments": [{"method": "cash", "amount": 6000}]})
    assert batch_qty(admin, s1["location_id"], pad["id"]) == {("A", d(20)): 10, ("B", d(200)): 10}
    # 退 1 包回库存：回到 A 批
    item = o["items"][0]
    clerk.post(f"/api/orders/{o['id']}/refund", {"lines": [{"order_item_id": item["id"], "qty": 1}],
                                                 "method": "cash", "restock": True})
    assert batch_qty(admin, s1["location_id"], pad["id"]) == {("A", d(20)): 20, ("B", d(200)): 10}
    assert stock_of(admin, s1["location_id"], pad["id"]) == 130


def test_adjust_down_caps_batches(admin, world):
    wh, pad = world["wh"], world["pad"]
    setup_batches(admin, world)
    # 仓库护理垫：原有 400 无批次 + 80 有批次 = 480；盘成 60，批次合计不能超过 60，先清最早到期的
    admin.post("/api/stock-docs", {"kind": "adjust", "to_location_id": wh["id"],
                                   "lines": [{"stock_item_id": pad["id"], "qty": 60}]})
    assert sum(batch_qty(admin, wh["id"], pad["id"]).values()) <= 60


def test_expiry_alerts(admin, world):
    wh, pad = world["wh"], world["pad"]
    setup_batches(admin, world)
    admin.post("/api/stock-docs", {"kind": "in", "to_location_id": wh["id"], "lines": [
        {"stock_item_id": pad["id"], "qty": 5, "batch_no": "OLD", "expiry_date": d(-1)}]})
    # 默认 30 天：A 批（20 天）和已过期的 OLD 批提醒，B 批（200 天）不提醒
    alerts = admin.get("/api/expiry-alerts")
    assert [(a["batch_no"], a["expired"]) for a in alerts] == [("OLD", True), ("A", False)]
    assert alerts[1]["days_left"] == 20
    # 改成 10 天：只剩已过期的
    admin.put("/api/settings/rules", {"expiry_alert_days": 10})
    assert [a["batch_no"] for a in admin.get("/api/expiry-alerts")] == ["OLD"]
    assert [a["batch_no"] for a in admin.get("/api/expiry-alerts", days=365)] == ["OLD", "A", "B"]
    admin.put("/api/settings/rules", {"expiry_alert_days": "abc"}, expect=400)
    # 有效期早于生产日期不允许
    admin.post("/api/stock-docs", {"kind": "in", "to_location_id": wh["id"], "lines": [
        {"stock_item_id": pad["id"], "qty": 1, "production_date": d(0), "expiry_date": d(-5)}]}, expect=400)
    world["clerk"].get("/api/expiry-alerts", expect=403)


def test_sale_skips_expired_batches(admin, world):
    """医疗器械：已过期批次不能正常销售，只能报损出库；不允许负库存时，过期的不算可卖库存。"""
    s1, pad, clerk = world["s1"], world["pad"], world["clerk"]
    loc = s1["location_id"]
    admin.post("/api/stock-docs", {"kind": "in", "to_location_id": loc, "lines": [
        {"stock_item_id": pad["id"], "qty": 20, "batch_no": "OLD", "expiry_date": d(-1)},
        {"stock_item_id": pad["id"], "qty": 20, "batch_no": "NEW", "expiry_date": d(100)}]})
    sku = world["padp"]["skus"][0]  # 每包扣 10 片
    clerk.post("/api/pos/checkout", {"store_id": s1["id"], "lines": [{"sku_id": sku["id"], "qty": 2}],
                                     "payments": [{"method": "cash", "amount": 6000}]})
    assert batch_qty(admin, loc, pad["id"]) == {("OLD", d(-1)): 20}  # 扣的是没过期的 NEW 批
    # 不允许负库存：一号店 120 片里 20 片已过期，最多只能卖 100 片
    admin.put("/api/settings/rules", {"pos_allow_negative": False})
    r = clerk.req("POST", "/api/pos/checkout", expect=409, json={
        "store_id": s1["id"], "lines": [{"sku_id": sku["id"], "qty": 11}], "payments": [{"method": "cash", "amount": 33000}]})
    assert "已过期 20" in r["detail"]
    # 过期的走报损出库：先出最早到期的 OLD 批
    admin.post("/api/stock-docs", {"kind": "out", "from_location_id": loc, "reason": "报损",
                                   "lines": [{"stock_item_id": pad["id"], "qty": 20}]})
    assert batch_qty(admin, loc, pad["id"]) == {}
    assert stock_of(admin, loc, pad["id"]) == 100
