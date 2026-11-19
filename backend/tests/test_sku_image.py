"""规格图片：每个规格可以有自己的图片，后台、门店收银、顾客点单都能拿到；不设时为空，界面用商品图片。"""


def test_sku_image_saved_and_returned(client, admin, world):
    w = world
    p = w["water"]
    skus = [{**s, "image": "/media/small.png" if s["name"] == "小份" else ""} for s in p["skus"]]
    body = {k: p[k] for k in ("name", "unit", "category_id", "supplier_id")}
    r = admin.put(f"/api/products/{p['id']}", {**body, "skus": skus})
    imgs = {s["name"]: s["image"] for s in r["skus"]}
    assert imgs == {"小份": "/media/small.png", "大份": ""}
    # 门店收银
    got = next(x for x in w["clerk"].get("/api/products") if x["id"] == p["id"])
    assert {s["name"]: s["image"] for s in got["skus"]} == imgs
    # 顾客点单
    menu = client.get(f"/api/customer/menu/{w['a1']['code']}").json()
    got = next(x for x in menu["products"] if x["id"] == p["id"])
    assert {s["name"]: s["image"] for s in got["skus"]} == imgs
    # 不传 image 的旧客户端：新建规格默认为空
    new = admin.post("/api/products", {"name": "新品", "skus": [{"name": "默认", "price": 100}]})
    assert new["skus"][0]["image"] == ""
