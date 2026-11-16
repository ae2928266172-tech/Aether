"""出入库单：进价金额、出库原因、盘点盈亏、作废冲回。"""
from conftest import stock_of


def test_in_doc_with_price_and_out_reason(admin, world):
    wh, cup, pad, sup = world["wh"], world["cup"], world["pad"], world["sup"]
    # 入库填进价：纸杯 0.6 元 × 100；护理垫不填进价，按库存品成本 3 元
    d = admin.post("/api/stock-docs", {"kind": "in", "to_location_id": wh["id"], "supplier_id": sup["id"],
                                       "lines": [{"stock_item_id": cup["id"], "qty": 100, "unit_cost": 60},
                                                 {"stock_item_id": pad["id"], "qty": 10}]})
    lines = {ln["stock_item_id"]: ln for ln in d["lines"]}
    assert (lines[cup["id"]]["unit_cost"], lines[cup["id"]]["amount"]) == (60, 6000)
    assert (lines[pad["id"]]["unit_cost"], lines[pad["id"]]["amount"]) == (300, 3000)
    assert d["total_amount"] == 9000 and d["total_qty"] == 110 and d["supplier_name"] == "南京供应商"
    assert d["created_by_name"] == "管理员"
    # 进价不会自动改库存品成本
    assert next(i for i in admin.get("/api/stock-items") if i["id"] == cup["id"])["cost"] == 50
    # 出库原因：退供应商
    d = admin.post("/api/stock-docs", {"kind": "out", "from_location_id": wh["id"], "reason": "退供应商",
                                       "supplier_id": sup["id"], "lines": [{"stock_item_id": cup["id"], "qty": 3}]})
    assert d["reason"] == "退供应商" and d["total_amount"] == 150
    admin.post("/api/stock-docs", {"kind": "out", "from_location_id": wh["id"], "reason": "随便写",
                                   "lines": [{"stock_item_id": cup["id"], "qty": 1}]}, expect=400)
    admin.post("/api/stock-docs", {"kind": "in", "to_location_id": wh["id"],
                                   "lines": [{"stock_item_id": cup["id"], "qty": 1, "unit_cost": -1}]}, expect=400)
    # 按单号查
    docs = admin.get("/api/stock-docs", keyword=d["no"])
    assert [x["id"] for x in docs] == [d["id"]]


def test_adjust_profit_and_loss(admin, world):
    s1, cup, pad = world["s1"], world["cup"], world["pad"]
    # 一号店纸杯账面 100，实盘 95：盘亏 5 个 × 0.5 元；护理垫账面 100，实盘 102：盘盈 2 片 × 3 元
    d = admin.post("/api/stock-docs", {"kind": "adjust", "to_location_id": s1["location_id"],
                                       "lines": [{"stock_item_id": cup["id"], "qty": 95},
                                                 {"stock_item_id": pad["id"], "qty": 102}]})
    lines = {ln["stock_item_id"]: ln for ln in d["lines"]}
    assert (lines[cup["id"]]["book_qty"], lines[cup["id"]]["diff"], lines[cup["id"]]["amount"]) == (100, -5, -250)
    assert (lines[pad["id"]]["book_qty"], lines[pad["id"]]["diff"], lines[pad["id"]]["amount"]) == (100, 2, 600)
    assert d["total_qty"] == -3 and d["total_amount"] == 350
    assert stock_of(admin, s1["location_id"], cup["id"]) == 95


def test_void_doc_reverses_stock(admin, world):
    wh, s1, cup = world["wh"], world["s1"], world["cup"]
    # 调拨填错：多调了 30 个，作废后两边都冲回
    d = admin.post("/api/stock-docs", {"kind": "transfer", "from_location_id": wh["id"],
                                       "to_location_id": s1["location_id"],
                                       "lines": [{"stock_item_id": cup["id"], "qty": 30}]})
    assert stock_of(admin, wh["id"], cup["id"]) == 820 and stock_of(admin, s1["location_id"], cup["id"]) == 130
    admin.post(f"/api/stock-docs/{d['id']}/void", {"reason": ""}, expect=422)  # 必须写原因
    v = admin.post(f"/api/stock-docs/{d['id']}/void", {"reason": "数量填错"})
    assert v["voided"] and v["void_reason"] == "数量填错" and v["voided_by_name"] == "管理员"
    assert stock_of(admin, wh["id"], cup["id"]) == 850 and stock_of(admin, s1["location_id"], cup["id"]) == 100
    # 不能重复作废
    admin.post(f"/api/stock-docs/{d['id']}/void", {"reason": "再来"}, expect=409)
    # 台账：调入、调出都冲平；流水里能看到作废冲回
    r = next(x for x in admin.get("/api/stock-ledger", location_id=s1["location_id"]) if x["stock_item_id"] == cup["id"])
    assert (r["transfer_in"], r["closing"]) == (100, 100)
    moves = admin.get("/api/stock-moves", location_id=s1["location_id"], stock_item_id=cup["id"])
    assert moves[-1]["qty"] == -30 and "作废冲回" in moves[-1]["ref"]


def test_void_adjust_restores_difference_only(admin, world):
    s1, cup, clerk = world["s1"], world["cup"], world["clerk"]
    d = admin.post("/api/stock-docs", {"kind": "adjust", "to_location_id": s1["location_id"],
                                       "lines": [{"stock_item_id": cup["id"], "qty": 90}]})
    # 盘点后又卖了 2 个
    clerk.post("/api/pos/checkout", {"store_id": s1["id"], "lines": [{"sku_id": world["small"]["id"], "qty": 2}],
                                     "payments": [{"method": "cash", "amount": 2000}]})
    assert stock_of(admin, s1["location_id"], cup["id"]) == 88
    admin.post(f"/api/stock-docs/{d['id']}/void", {"reason": "盘错了"})
    # 只冲回盘点的 -10，销售的 2 个仍然扣着
    assert stock_of(admin, s1["location_id"], cup["id"]) == 98
    # 门店店员不能作废
    clerk.post(f"/api/stock-docs/{d['id']}/void", {"reason": "x"}, expect=403)


def test_store_adjust_ignores_unit_cost(admin, world, client):
    s1, cup = world["s1"], world["cup"]
    admin.put(f"/api/stores/{s1['id']}", {**s1, "staff_can_view_stock": True, "staff_can_edit_stock": True})
    role = world["store_role"]
    admin.put(f"/api/roles/{role['id']}", {**role, "permissions": role["permissions"] + ["stock_edit"]})
    d = world["clerk"].post(f"/api/stores/{s1['id']}/stock-adjust",
                            {"lines": [{"stock_item_id": cup["id"], "qty": 99, "unit_cost": 99999}]})
    assert d["lines"][0]["unit_cost"] == 50 and d["lines"][0]["amount"] == -50
