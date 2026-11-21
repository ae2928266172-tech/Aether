"""规格整理：尺码排序、找写法不同的重复规格、合并规格（2026-11-21 Aether 要求）。"""
import re
import unicodedata
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..models import (OrderItem, RequisitionLine, Sku, StockBalance, StockBatch, StockDocLine, StockItem,
                      StockMove, User)

# 尺码从小到大；2XL = XXL，3XL = XXXL，以此类推
_SIZE = re.compile(r"^\s*(?:(\d)\s*XL|(X{0,5})(XS|S|M|L)|均码|F)(?![A-Z])", re.I)


def size_rank(name: str) -> float | None:
    """规格名开头是尺码时返回大小顺序（XS < S < M < L < XL < 2XL/XXL < 3XL/XXXL …），否则 None。"""
    s = unicodedata.normalize("NFKC", name or "").upper()
    m = _SIZE.match(s)
    if not m:
        return None
    if m.group(0).strip() in ("均码", "F"):
        return 50
    if m.group(1):  # 2XL、3XL
        return 3 + int(m.group(1))
    xs, base = len(m.group(2) or ""), m.group(3)
    if base == "XS":
        return -xs  # XS、XXS
    if base == "L":
        return 3 + xs  # L=3、XL=4、XXL=5
    if base == "S" and xs:
        return -xs  # XXS 写成 XXS 的情况
    return {"S": 1, "M": 2}[base]


def sort_skus(skus):
    """有尺码的规格按尺码从小到大排在前面，其余保持原来的顺序。"""
    return sorted(skus, key=lambda s: (size_rank(s.name) is None, size_rank(s.name) or 0, s.sort, s.id))


def norm_name(name: str) -> str:
    """把写法不同但意思一样的规格名归成一样：全角半角、大小写、空格、× * x、括号、cm、片/P。

    例：“10*10cm*8 5p”“10*10*cm8 *5P”都归成 10*10*8*5p；数字之间的空格当作分隔，小数点保留。
    """
    s = unicodedata.normalize("NFKC", name or "").lower()
    s = s.replace("厘米", "cm").replace("片装", "片").replace("片/包", "片").replace("片", "p").replace("cm", "")
    s = re.sub(r"(?<=\d)\s*[×x＊]\s*(?=\d)", "*", s)
    s = re.sub(r"[()\[\]【】{}\-_—~～·,，、:：/]", " ", s)
    s = re.sub(r"(?<!\d)\.|\.(?!\d)", " ", s)
    s = re.sub(r"(?<=\d)\s+(?=\d)", "*", s)
    s = re.sub(r"\s+", "", s)
    s = re.sub(r"\*+", "*", s).strip("*")
    return s


def duplicate_groups(db: Session) -> list[dict]:
    from ..models import Product
    out = []
    for p in db.scalars(select(Product).where(Product.active.is_(True)).order_by(Product.id)):
        groups: dict[str, list[Sku]] = {}
        for s in p.skus:
            if s.active:
                groups.setdefault(norm_name(s.name), []).append(s)
        for key, ss in groups.items():
            if len(ss) > 1:
                out.append({"product_id": p.id, "product_name": p.name, "skus": [
                    {"id": s.id, "name": s.name, "price": s.price, "barcode": s.barcode,
                     "stock_item_id": s.stock_item_id, "stock_item_name": s.stock_item.name if s.stock_item else None,
                     "deduct_qty": str(s.deduct_qty)} for s in ss]})
    return out


def _merge_stock_item(db: Session, keep_id: int, drop_id: int):
    """把库存品 drop 并入 keep：各地点库存相加，批次、流水、单据、订单里的引用都改到 keep，最后删除 drop。"""
    for b in db.scalars(select(StockBalance).where(StockBalance.stock_item_id == drop_id)).all():
        k = db.scalar(select(StockBalance).where(StockBalance.stock_item_id == keep_id,
                                                 StockBalance.location_id == b.location_id).with_for_update())
        if k:
            k.qty = Decimal(k.qty) + Decimal(b.qty)
            db.delete(b)
        else:
            b.stock_item_id = keep_id
    db.flush()
    for model in (StockBatch, StockMove, StockDocLine, RequisitionLine, OrderItem, Sku):
        db.execute(update(model).where(model.stock_item_id == drop_id).values(stock_item_id=keep_id))
    db.flush()
    db.delete(db.get(StockItem, drop_id))


def merge(db: Session, keep: Sku, drop: Sku, user: User) -> Sku:
    if keep.id == drop.id:
        raise HTTPException(400, "不能合并到自己")
    if keep.product_id != drop.product_id:
        raise HTTPException(400, "只能合并同一商品的规格")
    if keep.stock_item_id and drop.stock_item_id and keep.stock_item_id != drop.stock_item_id:
        if Decimal(keep.deduct_qty) != Decimal(drop.deduct_qty):
            raise HTTPException(400, f"两个规格的扣减量不同（{keep.deduct_qty} 和 {drop.deduct_qty}），不能合并库存，请先改成一样")
        ki, di = keep.stock_item, drop.stock_item
        if ki.unit != di.unit:
            raise HTTPException(400, f"两个规格的库存单位不同（{ki.unit} 和 {di.unit}），不能合并")
        _merge_stock_item(db, keep.stock_item_id, drop.stock_item_id)
    elif drop.stock_item_id and not keep.stock_item_id:
        keep.stock_item_id, keep.deduct_qty = drop.stock_item_id, drop.deduct_qty
    db.execute(update(OrderItem).where(OrderItem.sku_id == drop.id).values(sku_id=keep.id))
    if not keep.barcode and drop.barcode:
        keep.barcode = drop.barcode
    if not keep.image and drop.image:
        keep.image = drop.image
    summary = f"{keep.product.name}：规格“{drop.name}”并入“{keep.name}”，库存相加，历史订单改记到“{keep.name}”"
    db.delete(drop)
    db.flush()
    from .. import audit
    audit.record(db, user, "合并规格", keep.product.name, summary=summary)
    db.flush()
    db.expire_all()
    return db.get(Sku, keep.id)
