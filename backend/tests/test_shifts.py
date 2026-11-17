"""收银员交班：备用金、应有现金、实点现金差额，按收银员分开。"""
import io

from openpyxl import load_workbook

from conftest import login


def checkout(api, store_id, sku_id, qty, method, amount, received=None):
    pay = {"method": method, "amount": amount}
    if received:
        pay["received"] = received
    return api.post("/api/pos/checkout", {"store_id": store_id, "lines": [{"sku_id": sku_id, "qty": qty}],
                                          "payments": [pay]})


def test_shift_flow(admin, world, client):
    s1, clerk, small = world["s1"], world["clerk"], world["small"]
    # 第二个收银员，同一家店
    admin.post("/api/users", {"username": "clerk2", "display_name": "店员乙", "role_id": world["store_role"]["id"],
                              "store_ids": [s1["id"]], "password": "123456"})
    clerk2 = login(client, "clerk2", "123456")
    assert clerk.get("/api/shifts/current", store_id=s1["id"])["shift"] is None
    sh = clerk.post("/api/shifts/open", {"store_id": s1["id"], "opening_cash": 20000})  # 备用金 200 元
    assert sh["status"] == "open" and sh["opening_cash"] == 20000
    # 重复开班返回同一班
    assert clerk.post("/api/shifts/open", {"store_id": s1["id"], "opening_cash": 1})["id"] == sh["id"]
    # 甲：现金 2 杯 20 元（收 50 找 30），微信 1 杯 10 元；乙：现金 3 杯 30 元（不算甲的）
    o1 = checkout(clerk, s1["id"], small["id"], 2, "cash", 2000, received=5000)
    checkout(clerk, s1["id"], small["id"], 1, "wechat", 1000)
    checkout(clerk2, s1["id"], small["id"], 3, "cash", 3000)
    # 甲退 1 杯现金 10 元
    clerk.post(f"/api/orders/{o1['id']}/refund", {"lines": [{"order_item_id": o1["items"][0]["id"], "qty": 1}],
                                                  "method": "cash", "restock": True})
    cur = clerk.get("/api/shifts/current", store_id=s1["id"])["shift"]
    assert cur["expected_cash"] == 20000 + 2000 - 1000 and cur["orders"] == 2 and cur["net"] == 2000
    # 交班：实点 208 元，短款 2 元
    closed = clerk.post(f"/api/shifts/{sh['id']}/close", {"counted_cash": 20800, "remark": "找零少了"})
    assert closed["status"] == "closed" and closed["expected_cash"] == 21000 and closed["cash_diff"] == -200
    assert closed["methods"]["wechat"]["pay"] == 1000 and closed["methods"]["cash"]["refund"] == 1000
    # 交班后再收的钱不算进这一班
    checkout(clerk, s1["id"], small["id"], 1, "cash", 1000)
    again = clerk.post(f"/api/shifts/{sh['id']}/close", {"counted_cash": 0})
    assert again["counted_cash"] == 20800 and again["expected_cash"] == 21000
    assert clerk.get("/api/shifts/current", store_id=s1["id"])["shift"] is None
    # 乙不能交甲的班
    sh2 = clerk.post("/api/shifts/open", {"store_id": s1["id"], "opening_cash": 0})
    clerk2.post(f"/api/shifts/{sh2['id']}/close", {"counted_cash": 0}, expect=403)
    # 收银员只看自己的记录；后台看全部并能导出
    mine = clerk.get("/api/shifts", store_id=s1["id"], mine=True)
    assert {r["cashier"] for r in mine} == {"店员甲"} and len(mine) == 2
    clerk.get("/api/shifts", expect=403)
    clerk.get("/api/shifts", store_id=world["s2"]["id"], mine=True, expect=403)
    assert len(admin.get("/api/shifts", store_id=s1["id"])) == 2
    resp = admin.get("/api/shifts", export=True)
    rows = list(load_workbook(io.BytesIO(resp.content)).active.iter_rows(values_only=True))
    closed_row = next(r for r in rows[1:] if r[3] != "当班中")
    assert closed_row[rows[0].index("差额（长+ / 短−）")] == -2
