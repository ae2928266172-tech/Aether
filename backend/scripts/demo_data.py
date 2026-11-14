"""往一个空系统里写演示数据（两家门店、区域、商品、库存、店员账号），方便试用。

用法：先启动后端，再运行
    python scripts/demo_data.py [http://127.0.0.1:8000] [管理员密码]
"""
import sys

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
PW = sys.argv[2] if len(sys.argv) > 2 else "admin123"
c = httpx.Client(base_url=BASE, timeout=20)


def call(method, url, body=None):
    r = c.request(method, url, json=body)
    if r.status_code >= 400:
        raise SystemExit(f"{method} {url} 失败：{r.status_code} {r.text}")
    return r.json()


tok = call("POST", "/api/auth/login", {"username": "admin", "password": PW})["token"]
c.headers["Authorization"] = "Bearer " + tok
if call("GET", "/api/stores"):
    raise SystemExit("系统里已经有门店，不再写演示数据")

s1 = call("POST", "/api/stores", {"name": "住院部一号店", "address": "1 号楼 1 层", "staff_can_view_stock": True})
s2 = call("POST", "/api/stores", {"name": "门诊二号店", "address": "门诊楼 2 层"})
for name in ("一病区", "二病区", "ICU 家属区"):
    call("POST", "/api/areas", {"store_id": s1["id"], "name": name})
call("POST", "/api/areas", {"store_id": s2["id"], "name": "门诊大厅"})

sup = call("POST", "/api/suppliers", {"name": "南京奥文医疗", "contact": "张经理", "phone": "025-00000000"})
care = call("POST", "/api/categories", {"name": "护理用品"})
gauze = call("POST", "/api/categories", {"name": "纱布敷料", "parent_id": care["id"]})
daily = call("POST", "/api/categories", {"name": "生活用品"})
drink = call("POST", "/api/categories", {"name": "饮品"})

items = {n: call("POST", "/api/stock-items", {"name": n, "unit": u, "cost": cost, "supplier_id": sup["id"]})
         for n, u, cost in (("护理垫", "片", 120), ("医用纱布", "片", 30), ("纸杯", "个", 10), ("矿泉水", "瓶", 80),
                            ("湿巾", "包", 250))}


def product(name, cat, skus, **kw):
    return call("POST", "/api/products", {"name": name, "category_id": cat["id"], "supplier_id": sup["id"], **kw,
                                          "skus": [{"name": n, "price": p, "stock_item_id": items[i]["id"], "deduct_qty": d,
                                                    "barcode": b} for n, p, i, d, b in skus]})


product("一次性护理垫", care, [("10 片装", 2800, "护理垫", 10, "6901000000011"), ("单片", 350, "护理垫", 1, "6901000000012")],
        unit="包", reg_cert_no="苏械备20230001号", production_license_no="苏食药监械生产备20230001号",
        registrant="示例医疗用品有限公司", production_address="江苏省南京市示例路 1 号")
product("医用纱布块", gauze, [("5 片", 500, "医用纱布", 5, "6901000000021"), ("20 片", 1800, "医用纱布", 20, "6901000000022")],
        unit="袋", reg_cert_no="苏械注准20232640001")
product("纸杯", daily, [("10 个", 300, "纸杯", 10, "6901000000031")], unit="包")
product("湿巾", daily, [("默认", 600, "湿巾", 1, "6901000000041")], unit="包")
product("矿泉水", drink, [("单瓶", 200, "矿泉水", 1, "6901000000051"), ("整箱 24 瓶", 4200, "矿泉水", 24, "6901000000052")], unit="瓶")

wh = next(l for l in call("GET", "/api/locations") if l["kind"] == "warehouse")
call("POST", "/api/stock-docs", {"kind": "in", "to_location_id": wh["id"], "supplier_id": sup["id"], "remark": "期初入库",
                                 "lines": [{"stock_item_id": i["id"], "qty": 1000} for i in items.values()]})
for s in (s1, s2):
    call("POST", "/api/stock-docs", {"kind": "transfer", "from_location_id": wh["id"], "to_location_id": s["location_id"],
                                     "remark": "首次铺货", "lines": [{"stock_item_id": i["id"], "qty": 200} for i in items.values()]})

role = next(r for r in call("GET", "/api/roles") if not r["is_admin"])
call("PUT", f"/api/roles/{role['id']}", {**role, "min_discount_rate": 80, "max_adjust_amount": 1000})
call("POST", "/api/users", {"username": "store1", "display_name": "一号店店员", "role_id": role["id"],
                            "store_ids": [s1["id"]], "password": "store123"})
call("POST", "/api/users", {"username": "store2", "display_name": "两店店长", "role_id": role["id"],
                            "store_ids": [s1["id"], s2["id"]], "password": "store123"})
print("演示数据已写入。门店账号 store1 / store2，密码 store123（只用于试用，上线前请删除或改密码）")
