"""助记码：拼音首字母搜商品。"""
from app import db as dbmod
from app.models import Product
from app.seed import fill_mnemonics


def test_mnemonic_auto_and_search(admin, world):
    water = admin.get(f"/api/products/{world['water']['id']}")
    assert water["mnemonic"] == "bzs"  # 杯装水
    # 后台和门店都能用助记码搜，大小写都行
    assert [p["name"] for p in admin.get("/api/products", keyword="BZS")] == ["杯装水"]
    assert [p["name"] for p in world["clerk"].get("/api/products", keyword="ycxhld")] == ["一次性护理垫"]
    # 可以手改；改回空则重新按名称生成
    body = {**water, "mnemonic": "shui", "skus": water["skus"]}
    assert admin.put(f"/api/products/{water['id']}", body)["mnemonic"] == "shui"
    assert admin.get("/api/products", keyword="shui")[0]["id"] == water["id"]
    body["mnemonic"] = ""
    body["name"] = "瓶装水"
    assert admin.put(f"/api/products/{water['id']}", body)["mnemonic"] == "pzs"


def test_fill_mnemonics_for_old_data(admin, world):
    with dbmod.SessionLocal() as db:
        p = db.get(Product, world["ice"]["id"])
        p.mnemonic = ""
        db.commit()
        fill_mnemonics(db)
        db.commit()
        assert db.get(Product, world["ice"]["id"]).mnemonic == "bs"  # 冰水
