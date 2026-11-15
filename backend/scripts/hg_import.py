"""把惠管家只读导出的数据导入新系统（只在空库上运行一次）。

用法（先设置好目标数据库和图片目录的环境变量）：
    set DATABASE_URL=sqlite:///C:/Users/.../shouyin/shouyin.db
    set SHOUYIN_MEDIA=C:/Users/.../shouyin/media
    python scripts/hg_import.py <导出目录> [--no-images]

规则（Aether 2026-11-15 确认）：
- **、*、ICU-、NICU-、EICU- 前缀去掉后同名的合并成一个商品；“护理垫=成人护理垫”“振德灭菌凡士林纱布=振德凡士林油纱”
  “医用中单(灭菌)=(灭菌)医用中单”也合并；同名不同规格分开；
- 合并后的商品放进各版本原来所在的全部分类；
- 名称里的“(5片起点)”等去掉，转成每单起订量；
- 无菌采样杯 120ml 统一 9.80 元；
- 新建门店“医辅中心”，各版本库存（含负数）相加后作为期初库存记在门店；中心仓库从 0 开始；
- “下方备注栏备注床号”“请务必备注好床号”不迁移。
"""
import os
import sys
import uuid
from decimal import Decimal

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)

import hg_merge_plan as mp  # noqa: E402


def fen(v) -> int:
    return int(round(float(v or 0) * 100))


def main(export_dir: str, images: bool = True):
    if not os.environ.get("DATABASE_URL"):
        raise SystemExit("请先设置 DATABASE_URL（目标数据库），避免误导入到演示库")
    from sqlalchemy import select

    from app import db as dbmod
    from app.models import (Category, Location, Product, Sku, StockDoc, StockDocLine, StockItem, Store, Supplier)
    from app.seed import init_db
    from app.services.inventory import change_stock

    init_db(dbmod.engine, dbmod.SessionLocal)
    rows, products = mp.build(export_dir)
    plan = mp.plan(products)
    cats_src = mp.load(export_dir, "categories")
    sups_src = mp.load(export_dir, "suppliers")
    goods_src = mp.load(export_dir, "goods")
    photo_by_name = {}
    for g in goods_src:
        base, _, _ = mp.split_name(g["goodsName"])
        if g.get("photo") and base not in photo_by_name:
            photo_by_name[base] = g["photo"]

    db = dbmod.SessionLocal()
    if db.scalar(select(Product.id).limit(1)):
        raise SystemExit("目标数据库里已经有商品了，为避免重复导入，已停止")

    # 门店
    store = db.scalar(select(Store).where(Store.name == "医辅中心"))
    if not store:
        loc = Location(name="医辅中心", kind="store")
        db.add(loc)
        db.flush()
        store = Store(name="医辅中心", location_id=loc.id, accept_online_orders=True)
        db.add(store)
        db.flush()

    # 分类（按惠管家的顺序）
    cat_ids = {}
    for i, c in enumerate(sorted(cats_src, key=lambda c: c.get("treeCode") or c.get("catCode") or "")):
        obj = Category(name=c["catName"].strip(), sort=i)
        db.add(obj)
        db.flush()
        cat_ids[c["catName"].strip()] = obj.id

    # 供应商
    sup_ids = {}
    for s in sups_src:
        name = s["supplierName"].strip()
        if name in sup_ids:
            continue
        obj = Supplier(name=name, contact=s.get("contacts") or "", phone=s.get("contactsNumber") or "",
                       remark=s.get("memo") or "", active=s.get("status") == 1)
        db.add(obj)
        db.flush()
        sup_ids[name] = obj.id

    media = os.environ.get("SHOUYIN_MEDIA") or os.path.join(os.path.dirname(HERE), "media")
    os.makedirs(media, exist_ok=True)
    http = None
    if images:
        import httpx
        http = httpx.Client(timeout=20)

    def fetch_image(base):
        path = photo_by_name.get(base)
        if not (http and path):
            return ""
        try:
            r = http.get("https://assets.smartpos.top/image" + path)
            if r.status_code != 200 or not r.headers.get("content-type", "").startswith("image/"):
                return ""
            ext = {"image/png": ".png", "image/gif": ".gif", "image/webp": ".webp"}.get(r.headers["content-type"], ".jpg")
            name = uuid.uuid4().hex + ext
            with open(os.path.join(media, name), "wb") as f:
                f.write(r.content)
            return "/media/" + name
        except Exception:
            return ""

    # 商品、规格、库存品
    by_product = {}
    for r in plan:
        by_product.setdefault(r["product"], []).append(r)
    used_item_names = set()
    stock_lines = []
    n_img = 0
    for sort, (name, specs) in enumerate(by_product.items()):
        first = specs[0]
        cats = [cat_ids[c] for c in first["cat_list"] if c in cat_ids]
        img = fetch_image(name)
        n_img += bool(img)
        p = Product(name=name, code=first["hg_code"], unit=first["unit"] or "件", image=img,
                    supplier_id=sup_ids.get(first["supplier"]), category_id=cats[0] if cats else None,
                    min_qty=first["min_qty"], online_visible=True, active=True, sort=sort)
        p.categories = [db.get(Category, c) for c in cats]
        db.add(p)
        db.flush()
        for i, r in enumerate(specs):
            item_name = name if r["spec"] == "默认" else f"{name} {r['spec']}"
            k = 2
            while item_name in used_item_names:
                item_name = f"{name} {r['spec']}（{k}）"
                k += 1
            used_item_names.add(item_name)
            item = StockItem(name=item_name, code=r["hg_code"], unit=r["unit"] or "件", cost=fen(r["cost"]),
                             supplier_id=sup_ids.get(r["supplier"]))
            db.add(item)
            db.flush()
            barcode = (r["barcode"] or "").split(" / ")[0]
            db.add(Sku(product_id=p.id, name=r["spec"], barcode=barcode, price=fen(r["price"]), cost=None,
                       stock_item_id=item.id, deduct_qty=Decimal(1), sort=i))
            if r["qty"]:
                stock_lines.append((item.id, Decimal(str(r["qty"]))))
    db.flush()

    # 期初库存：一张盘点单，记在门店
    doc = StockDoc(no="PD-HG-INIT", kind="adjust", to_location_id=store.location_id,
                   remark="从惠管家迁移的期初库存（各版本合并相加，含负数）", request_id="hg-import-2026-11-15")
    db.add(doc)
    db.flush()
    for item_id, q in stock_lines:
        db.add(StockDocLine(doc_id=doc.id, stock_item_id=item_id, qty=q))
        change_stock(db, location_id=store.location_id, stock_item_id=item_id, qty=q, kind="adjust", doc_id=doc.id)
    db.commit()

    src_total = round(sum(r["qty"] for r in rows), 3)
    new_total = round(float(sum(q for _, q in stock_lines)), 3)
    print({"products": len(by_product), "skus": len(plan), "categories": len(cat_ids), "suppliers": len(sup_ids),
           "images": n_img, "stock_lines": len(stock_lines), "source_stock_total": src_total, "imported_stock_total": new_total,
           "source_skus": len(rows), "store_id": store.id})


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    main(args[0], images="--no-images" not in sys.argv)
