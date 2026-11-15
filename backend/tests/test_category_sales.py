"""按分类查销售：含小类、多分类商品、退款。"""


def test_category_sales(admin, world):
    w, clerk = world, world["clerk"]
    care = admin.post("/api/categories", {"name": "护理用品"})
    gauze = admin.post("/api/categories", {"name": "纱布", "parent_id": care["id"]})
    # 杯装水同时在“饮品”和“护理用品/纱布”里；冰水只在饮品；护理垫没分类
    p = w["water"]
    admin.put(f"/api/products/{p['id']}", {"name": p["name"], "skus": p["skus"], "category_ids": [w["cat"]["id"], gauze["id"]]})
    pay = lambda lines, amt: clerk.post("/api/pos/checkout", {"store_id": w["s1"]["id"], "lines": lines,
                                                                "payments": [{"method": "cash", "amount": amt}]})
    o = pay([{"sku_id": w["small"]["id"], "qty": 3}], 3000)
    pay([{"sku_id": w["ice"]["skus"][0]["id"], "qty": 2}], 1000)
    pay([{"sku_id": w["padp"]["skus"][0]["id"], "qty": 1}], 3000)
    clerk.post(f"/api/orders/{o['id']}/refund", {"lines": [{"order_item_id": o["items"][0]["id"], "qty": 1}]})

    rows = {r["name"]: r for r in admin.get("/api/reports/category-sales")["rows"]}
    assert (rows["饮品"]["net_qty"], rows["饮品"]["net"]) == (4, 3000)            # 杯装水 3-1 + 冰水 2
    assert (rows["护理用品"]["net_qty"], rows["护理用品"]["net"]) == (2, 2000)    # 小类里的杯装水算进大类
    assert rows["纱布"]["refund_qty"] == 1 and rows["纱布"]["product_count"] == 1
    assert rows["未分类"]["net"] == 3000

    # 商品销售按分类筛选
    names = {r["product_name"] for r in admin.get("/api/reports/product-sales", category_id=care["id"])["rows"]}
    assert names == {"杯装水"}
    d = admin.get("/api/reports/product-sales/detail", category_id=w["cat"]["id"])
    assert d["sums"]["qty"] == 3 + 2 - 1
    r = admin.c.get("/api/reports/category-sales", params={"export": "true"}, headers={"Authorization": "Bearer " + admin.token})
    assert r.status_code == 200 and r.content[:2] == b"PK"
    clerk.get("/api/reports/category-sales", expect=403)
