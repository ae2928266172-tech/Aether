"""合并写法不同、其实相同的重复规格（2026-11-21 Aether：纱布类“规格一样但打字不一样”的要合并）。

先备份数据库再运行。默认只列出要合并的，不改数据；确认后加 --apply 才合并：
    python scripts/merge_dup_skus.py                # 只看纱布类
    python scripts/merge_dup_skus.py --keyword ''   # 看全部商品
    python scripts/merge_dup_skus.py --apply

每组保留库存最多的规格（一样多时保留先建的），其余并入：库存相加，批次、单据、历史订单跟着走。
扣减量或库存单位不同的组不合并，只列出来。
"""
import argparse
import os
import sys
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import HTTPException  # noqa: E402
from sqlalchemy import func, select  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.models import Product, StockBalance, User  # noqa: E402
from app.services import skus as svc  # noqa: E402


def stock(db, sku) -> Decimal:
    if not sku.stock_item_id:
        return Decimal(0)
    return Decimal(db.scalar(select(func.coalesce(func.sum(StockBalance.qty), 0))
                             .where(StockBalance.stock_item_id == sku.stock_item_id)) or 0)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--keyword", default="纱布", help="只处理名称含这个词的商品，空字符串表示全部")
    ap.add_argument("--apply", action="store_true", help="真正合并（不加只列出）")
    ap.add_argument("--operator", default="admin", help="操作日志里记的账号")
    a = ap.parse_args(argv)
    merged = skipped = 0
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.username == a.operator))
        q = select(Product).where(Product.active.is_(True)).order_by(Product.id)
        if a.keyword:
            q = q.where(Product.name.contains(a.keyword))
        for pid in [p.id for p in db.scalars(q)]:
            p = db.get(Product, pid)
            groups: dict[str, list] = {}
            for s in p.skus:
                if s.active:
                    groups.setdefault(svc.norm_name(s.name), []).append(s)
            for ss in groups.values():
                if len(ss) < 2:
                    continue
                ss.sort(key=lambda s: (-stock(db, s), s.id))
                keep, drops = ss[0], ss[1:]
                desc = f"{p.name}：保留“{keep.name}”（库存 {stock(db, keep).normalize():f}），并入 " + "、".join(
                    f"“{d.name}”（库存 {stock(db, d).normalize():f}）" for d in drops)
                if not a.apply:
                    print("将合并", desc)
                    merged += 1
                    continue
                try:
                    for d in drops:
                        keep = svc.merge(db, keep, d, user)
                    db.commit()
                    print("已合并", desc)
                    merged += 1
                except HTTPException as e:
                    db.rollback()
                    print("未合并", desc, "——", e.detail)
                    skipped += 1
    print(f"共 {merged} 组{'已合并' if a.apply else '待合并（加 --apply 执行）'}" + (f"，{skipped} 组未合并" if skipped else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
