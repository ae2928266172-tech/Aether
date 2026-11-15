"""惠管家导入脚本：用一份小的模拟导出数据跑一遍，核对合并、库存相加、起订量。"""
import json
import os
import subprocess
import sys

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _stock(gid, name, spec, price, qty, cat, barcode="", sup="南京奥文", cost="1.00", unit="个"):
    return {"goodsId": gid, "goodsCode": "C" + gid, "goodsName": name, "standardName": spec, "salePrice": price,
            "purchasingPrice": cost, "unitName": unit, "barCode": barcode, "quantity": str(qty), "categoryName": cat, "supplierName": sup}


def test_import(tmp_path):
    exp = tmp_path / "export"
    exp.mkdir()
    stock = [
        _stock("1", "棉垫(医用灭菌)", "20*30cm", "5.00", 959, "门诊换药"),
        _stock("2", "**棉垫(医用灭菌)", "20*30cm(五包)", "5.00", -379, "肛肠科住院部换药区"),
        _stock("3", "ICU-棉垫(医用灭菌)", "20*30cm", "5.00", -105, "ICU"),
        _stock("4", "NICU-棉垫(医用灭菌)", "20*30", "5.00", -32, "NICU脑病科"),
        _stock("5", "棉垫(医用灭菌)", "10*15cm", "3.00", 513, "门诊换药"),
        _stock("6", "无菌采样杯", "120ml", "6.80", 116, "消毒护理"),
        _stock("7", "NICU-无菌采样杯", "120ml", "9.80", 59, "NICU脑病科"),
        _stock("8", "**振德灭菌凡士林纱布(5片起点)", "10*10cm", "5.50", 824, "肛肠科住院部换药区", "111"),
        _stock("9", "振德凡士林油纱", "10*10cm", "5.50", 916, "门诊换药", "111"),
        _stock("10", "下方备注栏备注床号", "默认", "0", 0, "热销区"),
    ]
    goods = [{"id": "11", "goodsName": "W 型翻身垫", "standardName": "默认", "salePrice": "88.00", "purchasingPrice": "30.00",
              "goodsUnitName": "个", "goodsCode": "C11", "categoryName": "康复科", "supplierName": "南京奥文"}]
    cats = [{"catName": n, "treeCode": str(i)} for i, n in enumerate(["门诊换药", "肛肠科住院部换药区", "ICU", "NICU脑病科", "消毒护理", "热销区", "康复科"])]
    sups = [{"supplierName": "南京奥文", "status": 1}]
    for n, d in (("stock", stock), ("goods", goods), ("categories", cats), ("suppliers", sups)):
        (exp / f"{n}.json").write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
    db = tmp_path / "t.db"
    env = {**os.environ, "DATABASE_URL": f"sqlite:///{db.as_posix()}", "SHOUYIN_MEDIA": str(tmp_path / "media"),
           "SHOUYIN_SECRET": "x" * 40, "PYTHONIOENCODING": "utf-8"}
    r = subprocess.run([sys.executable, "scripts/hg_import.py", str(exp), "--no-images"], cwd=BACKEND, env=env,
                       capture_output=True, text=True, encoding="utf-8")
    assert r.returncode == 0, r.stderr
    import sqlite3
    con = sqlite3.connect(db)
    q = lambda sql: con.execute(sql).fetchall()
    prods = dict(q("select name, id from products"))
    assert set(prods) == {"棉垫(医用灭菌)", "无菌采样杯", "振德凡士林油纱", "W 型翻身垫"}
    specs = dict(q(f"select name, id from skus where product_id={prods['棉垫(医用灭菌)']}"))
    assert set(specs) == {"20*30cm", "10*15cm"}  # 同名不同规格分开，同规格各版本合并
    bal = dict(q("select i.name, b.qty from stock_balances b join stock_items i on i.id=b.stock_item_id"))
    assert float(bal["棉垫(医用灭菌) 20*30cm"]) == 959 - 379 - 105 - 32
    assert q(f"select price from skus where product_id={prods['无菌采样杯']}") == [(980,)]
    assert q(f"select min_qty from products where id={prods['振德凡士林油纱']}") == [(5,)]
    cats = {c for (c,) in q(f"select c.name from product_categories pc join categories c on c.id=pc.category_id where pc.product_id={prods['棉垫(医用灭菌)']}")}
    assert cats == {"门诊换药", "肛肠科住院部换药区", "ICU", "NICU脑病科"}
    assert q("select name from stores") == [("医辅中心",)]
    # 再跑一次不会重复导入
    r2 = subprocess.run([sys.executable, "scripts/hg_import.py", str(exp), "--no-images"], cwd=BACKEND, env=env,
                        capture_output=True, text=True, encoding="utf-8")
    assert r2.returncode != 0 and "已经有商品" in (r2.stdout + r2.stderr)
    con.close()
