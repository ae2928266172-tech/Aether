"""库存预警：库存小于等于预警量时提醒补货。"""


def test_stock_alert(admin, world):
    wh, s1, s2, cup, pad = world["wh"], world["s1"], world["s2"], world["cup"], world["pad"]
    # 没设预警量时不提醒
    assert admin.get("/api/stock-alerts") == []
    # 纸杯预警 60：仓库 850 不提醒，一号店 100 不提醒，二号店 50 提醒
    admin.put(f"/api/stock-items/{cup['id']}", {**cup, "alert_qty": 60})
    alerts = admin.get("/api/stock-alerts")
    assert [(a["location_id"], a["qty"], a["short"]) for a in alerts] == [(s2["location_id"], 50, 10)]
    # 等于预警量也提醒
    admin.put(f"/api/stock-items/{cup['id']}", {**cup, "alert_qty": 100})
    locs = {a["location_id"] for a in admin.get("/api/stock-alerts")}
    assert locs == {s1["location_id"], s2["location_id"]}
    # 按地点筛选；库存列表、台账带出 low 标记
    assert [a["name"] for a in admin.get("/api/stock-alerts", location_id=wh["id"])] == []
    row = next(r for r in admin.get("/api/stock", location_id=s1["location_id"]) if r["stock_item_id"] == cup["id"])
    assert row["low"] is True and row["alert_qty"] == 100
    led = next(r for r in admin.get("/api/stock-ledger", location_id=wh["id"]) if r["stock_item_id"] == cup["id"])
    assert led["low"] is False and led["alert_qty"] == 100
    # 没有库存记录的地点按 0 算：护理垫预警 5，二号店从没进过护理垫
    admin.put(f"/api/stock-items/{pad['id']}", {**pad, "alert_qty": 5})
    assert any(a["stock_item_id"] == pad["id"] and a["location_id"] == s2["location_id"] and a["qty"] == 0
               for a in admin.get("/api/stock-alerts"))
    # 停用的库存品不提醒；清空预警量也不提醒
    admin.put(f"/api/stock-items/{pad['id']}", {**pad, "alert_qty": 5, "active": False})
    admin.put(f"/api/stock-items/{cup['id']}", {**cup, "alert_qty": None})
    assert admin.get("/api/stock-alerts") == []
    # 预警量不能为负；门店店员不能看全部预警
    admin.put(f"/api/stock-items/{cup['id']}", {**cup, "alert_qty": -1}, expect=422)
    world["clerk"].get("/api/stock-alerts", expect=403)
