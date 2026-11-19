"""2026-11-19 审查里会动库存的几条：盘点重复行、要货超出仓库库存、作废并发。"""
import pytest
from sqlalchemy import text

from conftest import stock_of


def test_adjust_duplicate_lines_rejected(admin, world):
    wh, cup = world["wh"], world["cup"]
    before = stock_of(admin, wh["id"], cup["id"])
    r = admin.req("POST", "/api/stock-docs", 400, json={"kind": "adjust", "to_location_id": wh["id"], "lines": [
        {"stock_item_id": cup["id"], "qty": 10}, {"stock_item_id": cup["id"], "qty": 900}]})
    assert "两行" in r["detail"]
    assert stock_of(admin, wh["id"], cup["id"]) == before


def test_requisition_cannot_send_more_than_warehouse_has(admin, world):
    s1, wh, cup, clerk = world["s1"], world["wh"], world["cup"], world["clerk"]
    have = stock_of(admin, wh["id"], cup["id"])
    r = clerk.post(f"/api/stores/{s1['id']}/requisitions", {"lines": [{"stock_item_id": cup["id"], "qty": 10}]})
    admin.post(f"/api/requisitions/{r['id']}/fulfill", {"from_location_id": wh["id"],
               "lines": [{"stock_item_id": cup["id"], "qty": have + 1}]}, expect=409)
    assert stock_of(admin, wh["id"], cup["id"]) == have  # 仓库没有变负数
    assert admin.get("/api/requisitions", status="pending")["total"] == 1  # 要货单还在待处理


def test_void_claim_is_atomic(admin, world):
    """模拟两个作废请求同时到：第二个读到的还是“未作废”，但抢占时只能改到 0 行，必须 409 且不能冲第二遍。"""
    from fastapi import HTTPException

    from app import db as dbmod
    from app.models import StockDoc
    from app.services import inventory as inv
    wh, cup = world["wh"], world["cup"]
    doc = admin.post("/api/stock-docs", {"kind": "in", "to_location_id": wh["id"], "lines": [{"stock_item_id": cup["id"], "qty": 7}]})
    after_in = stock_of(admin, wh["id"], cup["id"])
    db = dbmod.SessionLocal()
    try:
        stale = db.get(StockDoc, doc["id"])  # 这个会话里先读到“未作废”
        assert stale.voided_at is None
        db.execute(text("UPDATE stock_docs SET voided_at = CURRENT_TIMESTAMP WHERE id = :i"), {"i": doc["id"]})  # 另一个请求抢先作废
        with pytest.raises(HTTPException) as e:
            inv.void_doc(db, doc["id"], None, "双击")
        assert e.value.status_code == 409
    finally:
        db.rollback()
        db.close()
    assert stock_of(admin, wh["id"], cup["id"]) == after_in
    # 正常作废一次成功，第二次 409
    admin.post(f"/api/stock-docs/{doc['id']}/void", {"reason": "录错"})
    assert stock_of(admin, wh["id"], cup["id"]) == after_in - 7
    admin.post(f"/api/stock-docs/{doc['id']}/void", {"reason": "再点一次"}, expect=409)
    assert stock_of(admin, wh["id"], cup["id"]) == after_in - 7
