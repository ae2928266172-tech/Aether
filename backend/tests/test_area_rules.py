"""商品多分类、区域点单规则。"""
from conftest import customer, stock_of


def _put(admin, p, **kw):
    body = {k: p[k] for k in ("name", "unit", "online_visible", "active")}
    body["skus"] = p["skus"]
    body.update(kw)
    return admin.put(f"/api/products/{p['id']}", body)


def _order(client, w, area, lines, expect=200):
    c = customer(client, "rules")
    return c.post("/api/customer/orders", {"area_code": w[area]["code"], "location_note": "1", "lines": lines}, expect=expect)


def test_product_in_multiple_categories_shares_stock(client, admin, world):
    w = world
    care = admin.post("/api/categories", {"name": "护理用品"})
    p = _put(admin, w["water"], category_ids=[w["cat"]["id"], care["id"]])
    assert p["category_ids"] == [w["cat"]["id"], care["id"]] and p["category_name"] == "饮品、护理用品"
    for cid in (w["cat"]["id"], care["id"]):
        assert w["water"]["id"] in [x["id"] for x in admin.get("/api/products", category_id=cid)]
    # 大类下的小类也能查到
    sub = admin.post("/api/categories", {"name": "纱布", "parent_id": care["id"]})
    _put(admin, w["ice"], category_ids=[sub["id"]])
    assert w["ice"]["id"] in [x["id"] for x in admin.get("/api/products", category_id=care["id"])]
    # 不管从哪个分类卖，扣的是同一个库存品
    w["clerk"].post("/api/pos/checkout", {"store_id": w["s1"]["id"], "lines": [{"sku_id": w["small"]["id"], "qty": 2}],
                                          "payments": [{"method": "cash", "amount": 2000}]})
    assert stock_of(admin, w["s1"]["location_id"], w["cup"]["id"]) == 98
    # 不传 category_ids 的旧写法仍然可用
    p = _put(admin, w["water"], category_id=care["id"])
    assert p["category_ids"] == [care["id"]]


def test_product_default_min_max(client, admin, world):
    w = world
    _put(admin, w["water"], min_qty=5, max_qty=8)
    _order(client, w, "a1", [{"sku_id": w["small"]["id"], "qty": 4}], expect=400)
    _order(client, w, "a1", [{"sku_id": w["small"]["id"], "qty": 9}], expect=400)
    # 不同规格合计计算：小份 3 + 大份 2 = 5
    _order(client, w, "a1", [{"sku_id": w["small"]["id"], "qty": 3}, {"sku_id": w["big"]["id"], "qty": 2}])
    # 门店收银不受限
    w["clerk"].post("/api/pos/checkout", {"store_id": w["s1"]["id"], "lines": [{"sku_id": w["small"]["id"], "qty": 1}],
                                          "payments": [{"method": "cash", "amount": 1000}]})
    admin.put(f"/api/products/{w['water']['id']}", {"name": "x", "skus": w["water"]["skus"], "min_qty": 9, "max_qty": 3},
              expect=400)


def test_area_no_limit_and_overrides(client, admin, world):
    w = world
    _put(admin, w["water"], min_qty=5)
    a1 = w["a1"]
    # ICU 式：本区域不限数量
    admin.put(f"/api/areas/{a1['id']}", {"store_id": a1["store_id"], "name": a1["name"], "no_qty_limit": True})
    _order(client, w, "a1", [{"sku_id": w["small"]["id"], "qty": 1}])
    _order(client, w, "a2", [{"sku_id": w["small"]["id"], "qty": 1}], expect=400)  # 其他区域仍要 5 件起
    admin.put(f"/api/areas/{a1['id']}", {"store_id": a1["store_id"], "name": a1["name"], "no_qty_limit": False})
    # 区域单独设：二病区起订 2、限购 3；0 表示本区域不限
    r = admin.put(f"/api/areas/{w['a2']['id']}/rules", [{"product_id": w["water"]["id"], "min_qty": 2, "max_qty": 3}])
    row = next(x for x in r["rules"] if x["product_id"] == w["water"]["id"])
    assert row["effective"] == {"allowed": True, "min_qty": 2, "max_qty": 3}
    _order(client, w, "a2", [{"sku_id": w["small"]["id"], "qty": 2}])
    _order(client, w, "a2", [{"sku_id": w["small"]["id"], "qty": 4}], expect=400)
    admin.put(f"/api/areas/{w['a2']['id']}/rules", [{"product_id": w["water"]["id"], "min_qty": 0}])
    _order(client, w, "a2", [{"sku_id": w["small"]["id"], "qty": 1}])
    # 菜单里带上本区域的起订量
    menu = client.get(f"/api/customer/menu/{w['a1']['code']}").json()
    assert next(p for p in menu["products"] if p["id"] == w["water"]["id"])["min_qty"] == 5


def test_area_allowed_products(client, admin, world):
    w = world
    # 一病区不能点冰水：菜单里看不到，下单被拒
    admin.put(f"/api/areas/{w['a1']['id']}/rules", [{"product_id": w["ice"]["id"], "allowed": False}])
    menu = client.get(f"/api/customer/menu/{w['a1']['code']}").json()
    assert w["ice"]["id"] not in [p["id"] for p in menu["products"]]
    r = _order(client, w, "a1", [{"sku_id": w["ice"]["skus"][0]["id"], "qty": 1}], expect=400)
    assert "不能点" in r["detail"]
    _order(client, w, "a2", [{"sku_id": w["ice"]["skus"][0]["id"], "qty": 1}])
    # 护理垫只在二病区可点（商品上设“只在指定区域可点”）
    padp = w["padp"]
    _put(admin, padp, area_limited=True, area_ids=[w["a2"]["id"]])
    _order(client, w, "a1", [{"sku_id": padp["skus"][0]["id"], "qty": 1}], expect=400)
    menu2 = client.get(f"/api/customer/menu/{w['a2']['code']}").json()
    assert padp["id"] in [p["id"] for p in menu2["products"]]
    rules = admin.get(f"/api/areas/{w['a1']['id']}/rules")["rules"]
    assert next(x for x in rules if x["product_id"] == padp["id"])["effective"]["allowed"] is False
    admin.put(f"/api/products/{padp['id']}", {"name": padp["name"], "skus": padp["skus"], "area_limited": True}, expect=400)
    # 门店员工不能改规则
    w["clerk"].put(f"/api/areas/{w['a1']['id']}/rules", [], expect=403)
