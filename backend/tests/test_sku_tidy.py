"""2026-11-21：尺码按 S M L XL XXL… 排序；写法不同的重复规格可以合并（库存相加，历史订单、批次跟着走）。"""
from conftest import stock_of


def test_size_order(admin, world):
    p = admin.post("/api/products", {"name": "静脉袜", "skus": [
        {"name": n, "price": 100} for n in ["XL弘生", "2XL", "S-弘生", "均码", "M", "XXXL", "L(cc:36-40)", "特殊款"]]})
    assert [s["name"] for s in p["skus"]] == ["S-弘生", "M", "L(cc:36-40)", "XL弘生", "2XL", "XXXL", "均码", "特殊款"]
    # 没有尺码的商品保持原来的顺序
    assert [s["name"] for s in world["water"]["skus"]] == ["小份", "大份"]


def test_merge_duplicate_skus(client, admin, world):
    w, clerk = world, world["clerk"]
    loc = w["s1"]["location_id"]
    g1 = admin.post("/api/stock-items", {"name": "纱布10x10", "unit": "包", "cost": 100})
    g2 = admin.post("/api/stock-items", {"name": "纱布10*10", "unit": "包", "cost": 100})
    for g, q in ((g1, 5), (g2, 3)):
        admin.post("/api/stock-docs", {"kind": "in", "to_location_id": loc,
                                       "lines": [{"stock_item_id": g["id"], "qty": q, "batch_no": "B" + str(q),
                                                  "expiry_date": "2028-01-01"}]})
    p = admin.post("/api/products", {"name": "医用纱布", "skus": [
        {"name": "10x10cm", "price": 500, "barcode": "", "stock_item_id": g1["id"]},
        {"name": "10*10 ", "price": 500, "barcode": "69009", "stock_item_id": g2["id"]},
        {"name": "5x5", "price": 300}]})
    a, b, _ = p["skus"]
    dups = admin.get("/api/sku-duplicates")
    grp = next(x for x in dups if x["product_id"] == p["id"])
    assert {s["id"] for s in grp["skus"]} == {a["id"], b["id"]}
    # 先卖一件“10*10”，合并后还能退货，退回到合并后的库存
    o = clerk.post("/api/pos/checkout", {"store_id": w["s1"]["id"], "lines": [{"sku_id": b["id"], "qty": 1}],
                                         "payments": [{"method": "cash", "amount": 500}]})
    m = admin.post("/api/skus/merge", {"keep_id": a["id"], "drop_ids": [b["id"]]})
    assert [s["name"] for s in m["skus"]] == ["10x10cm", "5x5"] and m["skus"][0]["barcode"] == "69009"
    assert stock_of(admin, loc, g1["id"]) == 7  # 5 + 3 − 卖出 1
    assert not any(x["product_id"] == p["id"] for x in admin.get("/api/sku-duplicates"))
    r = clerk.post(f"/api/orders/{o['id']}/refund", {"lines": [{"order_item_id": o["items"][0]["id"], "qty": 1}]})
    assert r["order"]["items"][0]["sku_id"] == a["id"]
    assert stock_of(admin, loc, g1["id"]) == 8
    # 扣减量不同不能合并；不同商品不能合并
    p2 = admin.post("/api/products", {"name": "纱布块", "skus": [
        {"name": "单片", "price": 100, "stock_item_id": g1["id"], "deduct_qty": 1},
        {"name": "单 片", "price": 100, "stock_item_id": w["pad"]["id"], "deduct_qty": 2}]})
    admin.post("/api/skus/merge", {"keep_id": p2["skus"][0]["id"], "drop_ids": [p2["skus"][1]["id"]]}, expect=400)
    admin.post("/api/skus/merge", {"keep_id": a["id"], "drop_ids": [p2["skus"][0]["id"]]}, expect=400)
    clerk.post("/api/skus/merge", {"keep_id": a["id"], "drop_ids": [p2["skus"][0]["id"]]}, expect=403)


def test_merge_script(admin, world, capsys):
    import importlib.util, pathlib
    spec = importlib.util.spec_from_file_location("m", pathlib.Path(__file__).parents[1] / "scripts" / "merge_dup_skus.py")
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    a = admin.post("/api/stock-items", {"name": "脚本纱布A", "unit": "包"})
    b = admin.post("/api/stock-items", {"name": "脚本纱布B", "unit": "包"})
    admin.post("/api/stock-docs", {"kind": "in", "to_location_id": world["s1"]["location_id"],
                                   "lines": [{"stock_item_id": b["id"], "qty": 4}]})
    p = admin.post("/api/products", {"name": "凡士林纱布", "skus": [
        {"name": "10x10", "price": 100, "stock_item_id": a["id"]}, {"name": "10*10cm", "price": 100, "stock_item_id": b["id"]},
        {"name": "5x5", "price": 50}]})
    m.main([])
    assert "将合并" in capsys.readouterr().out
    assert len(admin.get(f"/api/products/{p['id']}")["skus"]) == 3  # 只列出不改
    m.main(["--apply"])
    out = capsys.readouterr().out
    assert "已合并 凡士林纱布：保留“10*10cm”（库存 4）" in out
    assert [s["name"] for s in admin.get(f"/api/products/{p['id']}")["skus"]] == ["10*10cm", "5x5"]


def test_norm_name_real_gauze_names():
    from app.services.skus import norm_name
    # 2026-11-22 线上“灭菌脱脂纱布叠片”的实际写法
    assert norm_name("10*10cm*8 5p") == norm_name("10*10*cm8 *5P") == "10*10*8*5p"
    assert norm_name("5*7*8cm*5P") == norm_name("5*7*8 5p") == "5*7*8*5p"
    assert norm_name("7.5cm*7.5cm*8") == "7.5*7.5*8"
    assert norm_name("7.5*7.5cm*8*5P") == "7.5*7.5*8*5p"
    assert norm_name("75*75*8") != norm_name("7.5*7.5*8")
    assert norm_name("10cm*6m") != norm_name("8cm*6m")
    assert norm_name("10x10") == norm_name("10*10 ") == norm_name("10×10厘米") == norm_name("(10*10)")
    assert norm_name("规格 A") == norm_name("规格A")
    assert norm_name("5片装") == norm_name("5P")
