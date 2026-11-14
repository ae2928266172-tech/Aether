from conftest import stock_of


def test_transfer_and_ledger(admin, world):
    wh, s1, cup = world["wh"], world["s1"], world["cup"]
    assert stock_of(admin, wh["id"], cup["id"]) == 850
    assert stock_of(admin, s1["location_id"], cup["id"]) == 100
    # 出库 5 个报损
    admin.post("/api/stock-docs", {"kind": "out", "from_location_id": wh["id"], "remark": "报损",
                                   "lines": [{"stock_item_id": cup["id"], "qty": 5}]})
    rows = admin.get("/api/stock-ledger", location_id=wh["id"])
    r = next(x for x in rows if x["stock_item_id"] == cup["id"])
    assert (r["opening"], r["in"], r["out"], r["transfer_out"], r["closing"], r["current"]) == (0, 1000, 5, 150, 845, 845)
    r = next(x for x in admin.get("/api/stock-ledger", location_id=s1["location_id"]) if x["stock_item_id"] == cup["id"])
    assert (r["transfer_in"], r["closing"]) == (100, 100)
    moves = admin.get("/api/stock-moves", location_id=s1["location_id"], stock_item_id=cup["id"])
    assert moves[0]["kind_text"] == "调入" and moves[0]["balance_after"] == 100


def test_ledger_opening_uses_earlier_days(admin, world):
    from datetime import date, timedelta
    tomorrow = date.today() + timedelta(days=1)
    rows = admin.get("/api/stock-ledger", location_id=world["wh"]["id"], begin=str(tomorrow), end=str(tomorrow))
    r = next(x for x in rows if x["stock_item_id"] == world["cup"]["id"])
    assert r["opening"] == 850 and r["in"] == 0 and r["closing"] == 850


def test_rules(admin, world):
    wh, s1, cup = world["wh"], world["s1"], world["cup"]
    # 同一地点调拨被拒绝
    admin.post("/api/stock-docs", {"kind": "transfer", "from_location_id": wh["id"], "to_location_id": wh["id"],
                                   "lines": [{"stock_item_id": cup["id"], "qty": 1}]}, expect=400)
    # 仓库出库不能超过库存
    admin.post("/api/stock-docs", {"kind": "out", "from_location_id": wh["id"],
                                   "lines": [{"stock_item_id": cup["id"], "qty": 99999}]}, expect=409)
    assert stock_of(admin, wh["id"], cup["id"]) == 850
    # 同一请求号重复提交只生效一次
    body = {"kind": "in", "to_location_id": wh["id"], "request_id": "req-1",
            "lines": [{"stock_item_id": cup["id"], "qty": 10}]}
    d1 = admin.post("/api/stock-docs", body)
    d2 = admin.post("/api/stock-docs", body)
    assert d1["no"] == d2["no"]
    assert stock_of(admin, wh["id"], cup["id"]) == 860
    # 盘点：填实盘数，系统自动算差额
    admin.post("/api/stock-docs", {"kind": "adjust", "to_location_id": s1["location_id"],
                                   "lines": [{"stock_item_id": cup["id"], "qty": 97}]})
    assert stock_of(admin, s1["location_id"], cup["id"]) == 97
    r = next(x for x in admin.get("/api/stock-ledger", location_id=s1["location_id"]) if x["stock_item_id"] == cup["id"])
    assert r["adjust"] == -3


def test_store_stock_visibility(admin, world):
    clerk, s1, s2, cup = world["clerk"], world["s1"], world["s2"], world["cup"]
    # 默认后台不允许门店看库存
    clerk.get(f"/api/stores/{s1['id']}/stock", expect=403)
    clerk.get("/api/stock", expect=403, location_id=s1["location_id"])
    admin.put(f"/api/stores/{s1['id']}", {"name": "一号店", "staff_can_view_stock": True})
    rows = clerk.get(f"/api/stores/{s1['id']}/stock")
    assert next(r["qty"] for r in rows if r["stock_item_id"] == cup["id"]) == 100
    # 能看不能改
    clerk.post(f"/api/stores/{s1['id']}/stock-adjust", {"lines": [{"stock_item_id": cup["id"], "qty": 1}]}, expect=403)
    # 别的门店看不到
    admin.put(f"/api/stores/{s2['id']}", {"name": "二号店", "staff_can_view_stock": True})
    clerk.get(f"/api/stores/{s2['id']}/stock", expect=403)
    # 店员角色加上修改权限、门店也允许后可以盘点
    role = world["store_role"]
    admin.put(f"/api/roles/{role['id']}", {"name": role["name"], "is_admin": False,
                                            "permissions": role["permissions"] + ["stock_edit"]})
    admin.put(f"/api/stores/{s1['id']}", {"name": "一号店", "staff_can_view_stock": True, "staff_can_edit_stock": True})
    clerk.post(f"/api/stores/{s1['id']}/stock-adjust", {"lines": [{"stock_item_id": cup["id"], "qty": 95}]})
    assert stock_of(admin, s1["location_id"], cup["id"]) == 95
