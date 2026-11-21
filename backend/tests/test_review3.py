"""2026-11-21 第三份代码审查后补的回归测试。"""


def test_close_shift_checks_store_access(admin, world):
    """收银员被调离门店后，不能再交那家门店的班（交班看的是那家店的收款）。"""
    w, clerk = world, world["clerk"]
    s = clerk.post("/api/shifts/open", {"store_id": w["s1"]["id"], "opening_cash": 10000})
    uid = s["user_id"]
    admin.put(f"/api/users/{uid}", {"username": "clerk1", "display_name": "店员甲", "role_id": w["store_role"]["id"],
                                    "store_ids": [w["s2"]["id"]]})
    clerk.post(f"/api/shifts/{s['id']}/close", {"counted_cash": 10000}, expect=403)
    # 后台管理员可以替他交
    r = admin.post(f"/api/shifts/{s['id']}/close", {"counted_cash": 10000})
    assert r["status"] == "closed" and r["cash_diff"] == 0


def test_open_shift_twice_returns_same(admin, world):
    w, clerk = world, world["clerk"]
    a = clerk.post("/api/shifts/open", {"store_id": w["s1"]["id"], "opening_cash": 5000})
    b = clerk.post("/api/shifts/open", {"store_id": w["s1"]["id"], "opening_cash": 5000})
    assert a["id"] == b["id"]
