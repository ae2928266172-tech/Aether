"""门店要货申请。"""
from app import db as dbmod
from app.models import Role, Setting
from app.seed import migrate_perms
from conftest import login, stock_of


def test_requisition_flow(admin, world, client):
    s1, s2, wh, cup, pad, clerk = world["s1"], world["s2"], world["wh"], world["cup"], world["pad"], world["clerk"]
    # 店员（新建的门店角色默认有“要货申请”）给一号店要 30 个纸杯、20 片护理垫
    r = clerk.post(f"/api/stores/{s1['id']}/requisitions", {"remark": "周末备货", "request_id": "yh-1",
                                                           "lines": [{"stock_item_id": cup["id"], "qty": 30},
                                                                     {"stock_item_id": pad["id"], "qty": 20}]})
    assert r["status"] == "pending" and r["created_by_name"] == "店员甲" and len(r["lines"]) == 2
    # 重复提交只算一次
    assert clerk.post(f"/api/stores/{s1['id']}/requisitions", {"request_id": "yh-1", "lines": [
        {"stock_item_id": cup["id"], "qty": 30}]})["id"] == r["id"]
    # 不能给没绑定的门店要货；不能看别的门店的要货单
    clerk.post(f"/api/stores/{s2['id']}/requisitions", {"lines": [{"stock_item_id": cup["id"], "qty": 1}]}, expect=403)
    clerk.get("/api/requisitions", store_id=s2["id"], expect=403)
    assert clerk.get("/api/requisitions", store_id=s1["id"])["total"] == 1
    # 后台看到待处理
    assert admin.get("/api/requisitions", status="pending")["total"] == 1
    # 仓库照单发货：纸杯不够只发 25，护理垫照发 20
    done = admin.post(f"/api/requisitions/{r['id']}/fulfill", {
        "from_location_id": wh["id"], "note": "纸杯不够", "request_id": "ff-1",
        "lines": [{"stock_item_id": cup["id"], "qty": 25}, {"stock_item_id": pad["id"], "qty": 20}]})
    assert done["status"] == "done" and done["transfer_doc_no"].startswith("DB")
    assert {ln["stock_item_id"]: ln["sent_qty"] for ln in done["lines"]} == {cup["id"]: 25, pad["id"]: 20}
    assert stock_of(admin, s1["location_id"], cup["id"]) == 125 and stock_of(admin, wh["id"], cup["id"]) == 825
    # 重试同一请求不会重复调拨；已调拨的不能再处理或撤回
    admin.post(f"/api/requisitions/{r['id']}/fulfill", {"from_location_id": wh["id"], "request_id": "ff-1",
                                                       "lines": [{"stock_item_id": cup["id"], "qty": 25}]})
    assert stock_of(admin, s1["location_id"], cup["id"]) == 125
    admin.post(f"/api/requisitions/{r['id']}/reject", {"reason": "x"}, expect=409)
    clerk.post(f"/api/requisitions/{r['id']}/cancel", expect=409)
    # 调拨单备注里有要货单号
    doc = admin.get("/api/stock-docs", keyword=r["no"])
    assert len(doc) == 1 and doc[0]["kind"] == "transfer"


def test_reject_cancel_and_rules(admin, world):
    s1, wh, cup, clerk = world["s1"], world["wh"], world["cup"], world["clerk"]
    a = clerk.post(f"/api/stores/{s1['id']}/requisitions", {"lines": [{"stock_item_id": cup["id"], "qty": 5}]})
    b = clerk.post(f"/api/stores/{s1['id']}/requisitions", {"lines": [{"stock_item_id": cup["id"], "qty": 5}]})
    clerk.post(f"/api/requisitions/{a['id']}/reject", {"reason": "x"}, expect=403)  # 店员不能驳回
    rj = admin.post(f"/api/requisitions/{a['id']}/reject", {"reason": "上周刚送过"})
    assert rj["status"] == "rejected" and rj["handle_note"] == "上周刚送过"
    assert clerk.post(f"/api/requisitions/{b['id']}/cancel")["status"] == "cancelled"
    # 数量要大于 0；全部发 0 要用驳回；仓库库存不够不能发
    clerk.post(f"/api/stores/{s1['id']}/requisitions", {"lines": [{"stock_item_id": cup["id"], "qty": 0}]}, expect=422)
    c = clerk.post(f"/api/stores/{s1['id']}/requisitions", {"lines": [{"stock_item_id": cup["id"], "qty": 5}]})
    admin.post(f"/api/requisitions/{c['id']}/fulfill", {"from_location_id": wh["id"],
                                                       "lines": [{"stock_item_id": cup["id"], "qty": 0}]}, expect=400)
    admin.post(f"/api/requisitions/{c['id']}/fulfill", {"from_location_id": wh["id"],
                                                       "lines": [{"stock_item_id": cup["id"], "qty": 99999}]}, expect=409)
    assert admin.get(f"/api/requisitions", status="pending")["total"] == 1


def test_migrate_perms_gives_existing_roles_requisition(admin, world):
    role = world["store_role"]
    admin.put(f"/api/roles/{role['id']}", {**role, "permissions": [p for p in role["permissions"] if p != "requisition"]})
    with dbmod.SessionLocal() as db:
        db.delete(db.get(Setting, "_migrations"))  # 模拟旧版本数据库：还没补过
        db.commit()
        migrate_perms(db)
        db.commit()
        assert "requisition" in db.get(Role, role["id"]).permissions
        # 只补一次：管理员取消后不再加回
        r = db.get(Role, role["id"])
        r.permissions = [p for p in r.permissions if p != "requisition"]
        db.commit()
        migrate_perms(db)
        db.commit()
        assert "requisition" not in db.get(Role, role["id"]).permissions
