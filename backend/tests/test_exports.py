"""导出 Excel：商品资料、库存台账、出入库单据。"""
import io

from openpyxl import load_workbook


def _sheet(resp):
    assert resp.headers["content-type"].startswith("application/vnd.openxmlformats")
    ws = load_workbook(io.BytesIO(resp.content)).active
    return [list(r) for r in ws.iter_rows(values_only=True)]


def test_export_products(admin, world):
    rows = _sheet(admin.get("/api/products", export=True))
    assert rows[0][:3] == ["商品名称", "货号", "助记码"]
    small = next(r for r in rows if r[0] == "杯装水" and r[5] == "小份")
    assert small[6] == "690001" and small[7] == 10 and small[9] == "纸杯"
    assert any(r[0] == "一次性护理垫" and r[14] == "苏械备20230001" for r in rows)
    world["clerk"].get("/api/products", export=True, expect=403)


def test_export_ledger_and_docs(admin, world):
    wh, cup = world["wh"], world["cup"]
    admin.put(f"/api/stock-items/{cup['id']}", {**cup, "alert_qty": 900})
    rows = _sheet(admin.get("/api/stock-ledger", location_id=wh["id"], export=True))
    r = next(x for x in rows if x[0] == "纸杯")
    head = rows[0]
    assert r[head.index("入库")] == 1000 and r[head.index("当前库存")] == 850 and r[head.index("低于预警")] == "是"
    d = admin.post("/api/stock-docs", {"kind": "out", "from_location_id": wh["id"], "reason": "报损",
                                       "lines": [{"stock_item_id": cup["id"], "qty": 2}]})
    admin.post(f"/api/stock-docs/{d['id']}/void", {"reason": "填错"})
    rows = _sheet(admin.get("/api/stock-docs", export=True))
    r = next(x for x in rows if x[0] == d["no"])
    head = rows[0]
    assert r[head.index("出库原因")] == "报损" and r[head.index("金额 / 盈亏金额")] == 1 and r[-1] == "已作废：填错"
