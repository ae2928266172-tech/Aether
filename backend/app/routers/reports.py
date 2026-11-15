"""营收业绩与商品销售核对（只开放给有“营收报表”权限的后台账号）。

口径：
- 收款按收款时间、退款按退款时间计入当期；实收 = 收款 − 退款。
- 销售件数按收款时间计入，退货件数按退款时间扣减；打折、调低应收体现在“优惠”和实收里，件数不变。
- 未收款、已取消的订单不计入营收。
"""
import io
from collections import defaultdict
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Font
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db, now
from ..models import Order, OrderItem, Payment, Refund, RefundLine, Store, User
from ..security import require
from ..services.orders import PAY_METHODS

router = APIRouter(prefix="/api/reports", tags=["报表"])


def _range(begin: date | None, end: date | None):
    today = now().date()
    b, e = begin or today, end or today
    if e < b:
        raise HTTPException(400, "结束日期不能早于开始日期")
    if (e - b).days > 3660:
        raise HTTPException(400, "时间范围过大")
    return b, e, datetime.combine(b, time.min), datetime.combine(e + timedelta(days=1), time.min)


def _bucket(d: datetime, group: str) -> str:
    if group == "week":
        monday = d.date() - timedelta(days=d.weekday())
        return f"{monday:%Y-%m-%d}~{monday + timedelta(days=6):%m-%d}"
    if group == "month":
        return f"{d:%Y-%m}"
    return f"{d:%Y-%m-%d}"


def _xlsx(title: str, header: list[str], rows: list[list], name: str):
    wb = Workbook()
    ws = wb.active
    ws.title = title[:30]
    ws.append(header)
    for c in ws[1]:
        c.font = Font(bold=True)
    for r in rows:
        ws.append(r)
    for col in ws.columns:
        ws.column_dimensions[col[0].column_letter].width = max(10, min(40, max(len(str(c.value or "")) for c in col) * 2))
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    from urllib.parse import quote
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(name)}.xlsx"})


def y(fen) -> float:
    return round((fen or 0) / 100, 2)


@router.get("/revenue")
def revenue(begin: date | None = None, end: date | None = None, store_id: int | None = None,
            group: str = "day", export: bool = False, db: Session = Depends(get_db),
            _: User = Depends(require("reports"))):
    if group not in ("day", "week", "month"):
        raise HTTPException(400, "group 只能是 day / week / month")
    b, e, start, stop = _range(begin, end)
    stores = {s.id: s.name for s in db.scalars(select(Store))}

    def blank():
        return {"orders": 0, "pos_orders": 0, "online_orders": 0, "original": 0, "discount": 0, "received": 0,
                "refunded": 0, "net": 0, "qty": 0, "refund_qty": 0, "cost": 0, "profit": 0,
                "methods": {m: 0 for m in PAY_METHODS}}
    data = defaultdict(blank)

    oq = select(Order).where(Order.paid_at >= start, Order.paid_at < stop)
    if store_id:
        oq = oq.where(Order.store_id == store_id)
    for o in db.scalars(oq):
        k = (_bucket(o.paid_at, group), o.store_id)
        r = data[k]
        r["orders"] += 1
        r["pos_orders" if o.source == "pos" else "online_orders"] += 1
        r["original"] += o.original_amount
        r["discount"] += o.original_amount - o.payable_amount
        r["qty"] += sum(i.qty for i in o.items)
        r["cost"] += sum(i.unit_cost * i.qty for i in o.items)

    pq = select(Payment, Order.store_id).join(Order, Order.id == Payment.order_id) \
        .where(Payment.created_at >= start, Payment.created_at < stop)
    if store_id:
        pq = pq.where(Order.store_id == store_id)
    for p, sid in db.execute(pq):
        r = data[(_bucket(p.created_at, group), sid)]
        if p.kind == "pay":
            r["received"] += p.amount
            r["methods"][p.method] += p.amount
        else:
            r["refunded"] += p.amount
            r["methods"][p.method] -= p.amount

    rq = select(RefundLine, Refund.created_at, Order.store_id, OrderItem.unit_cost) \
        .join(Refund, Refund.id == RefundLine.refund_id).join(Order, Order.id == Refund.order_id) \
        .join(OrderItem, OrderItem.id == RefundLine.order_item_id) \
        .where(Refund.created_at >= start, Refund.created_at < stop)
    if store_id:
        rq = rq.where(Order.store_id == store_id)
    for ln, at, sid, unit_cost in db.execute(rq):
        r = data[(_bucket(at, group), sid)]
        r["refund_qty"] += ln.qty
        r["cost"] -= unit_cost * ln.qty

    rows = []
    total = blank()
    for (bucket, sid), r in sorted(data.items()):
        r["net"] = r["received"] - r["refunded"]
        r["profit"] = r["net"] - r["cost"]
        rows.append({"period": bucket, "store_id": sid, "store_name": stores.get(sid, ""), **r})
        for k, v in r.items():
            if k == "methods":
                for m, a in v.items():
                    total["methods"][m] += a
            else:
                total[k] += v
    total["net"] = total["received"] - total["refunded"]
    total["profit"] = total["net"] - total["cost"]

    if export:
        header = ["期间", "门店", "单数", "门店收银单数", "小程序单数", "商品原价", "优惠", "收款", "退款", "实收",
                  "销售件数", "退货件数", "成本", "毛利"] + [f"{t}净收" for t in PAY_METHODS.values()]
        def line(period, store, r):
            return [period, store, r["orders"], r["pos_orders"], r["online_orders"], y(r["original"]), y(r["discount"]),
                    y(r["received"]), y(r["refunded"]), y(r["net"]), r["qty"], r["refund_qty"], y(r["cost"]),
                    y(r["profit"])] + [y(r["methods"][m]) for m in PAY_METHODS]
        out = [line(r["period"], r["store_name"], r) for r in rows] + [line("合计", "", total)]
        name = {"day": "日报", "week": "周报", "month": "月报"}[group]
        store_name = stores.get(store_id, "全部门店") if store_id else "全部门店"
        return _xlsx(name, header, out, f"营收{name}_{store_name}_{b}_{e}")
    return {"begin": b.isoformat(), "end": e.isoformat(), "group": group, "rows": rows, "total": total}


def category_product_ids(db: Session, category_id: int) -> set[int]:
    """某个分类（含它的小类）下的所有商品：商品主分类或附加分类命中都算。"""
    from ..models import Category, Product, ProductCategory
    cats = {category_id} | set(db.scalars(select(Category.id).where(Category.parent_id == category_id)))
    ids = set(db.scalars(select(Product.id).where(Product.category_id.in_(cats))))
    ids |= set(db.scalars(select(ProductCategory.product_id).where(ProductCategory.category_id.in_(cats))))
    return ids


def _sales(db: Session, start, stop, store_id, keyword, sku_id=None, product_ids: set[int] | None = None):
    """商品销售明细：收款的销售行 + 退货行。product_ids 不为空时只看这些商品（按分类筛选用）。"""
    lines = []
    q = select(OrderItem, Order).join(Order, Order.id == OrderItem.order_id) \
        .where(Order.paid_at >= start, Order.paid_at < stop)
    if store_id:
        q = q.where(Order.store_id == store_id)
    if sku_id:
        q = q.where(OrderItem.sku_id == sku_id)
    if product_ids is not None:
        q = q.where(OrderItem.product_id.in_(product_ids or [-1]))
    if keyword:
        q = q.where(OrderItem.product_name.contains(keyword) | OrderItem.sku_name.contains(keyword))
    for it, o in db.execute(q):
        lines.append({"type": "sale", "type_text": "销售", "time": o.paid_at, "order_id": o.id, "order_no": o.no,
                      "store_id": o.store_id, "store_name": o.store.name, "source": o.source,
                      "area": (o.area_name + " " + o.location_note).strip(), "sku_id": it.sku_id,
                      "product_name": it.product_name, "sku_name": it.sku_name, "qty": it.qty,
                      "unit_price": it.unit_price, "amount": it.amount, "paid": it.paid_share,
                      "discount": it.amount - it.paid_share, "cost": it.unit_cost * it.qty})
    q = select(RefundLine, Refund, OrderItem, Order).join(Refund, Refund.id == RefundLine.refund_id) \
        .join(OrderItem, OrderItem.id == RefundLine.order_item_id).join(Order, Order.id == Refund.order_id) \
        .where(Refund.created_at >= start, Refund.created_at < stop)
    if store_id:
        q = q.where(Order.store_id == store_id)
    if sku_id:
        q = q.where(OrderItem.sku_id == sku_id)
    if product_ids is not None:
        q = q.where(OrderItem.product_id.in_(product_ids or [-1]))
    if keyword:
        q = q.where(OrderItem.product_name.contains(keyword) | OrderItem.sku_name.contains(keyword))
    for ln, rf, it, o in db.execute(q):
        lines.append({"type": "refund", "type_text": "退货", "time": rf.created_at, "order_id": o.id, "order_no": o.no,
                      "refund_no": rf.no, "store_id": o.store_id, "store_name": o.store.name, "source": o.source,
                      "area": (o.area_name + " " + o.location_note).strip(), "sku_id": it.sku_id,
                      "product_name": it.product_name, "sku_name": it.sku_name, "qty": -ln.qty,
                      "unit_price": it.unit_price, "amount": -it.unit_price * ln.qty, "paid": -ln.amount,
                      "discount": -(it.unit_price * ln.qty - ln.amount), "cost": -it.unit_cost * ln.qty})
    lines.sort(key=lambda x: (x["time"], x["order_id"]))
    return lines


@router.get("/product-sales")
def product_sales(begin: date | None = None, end: date | None = None, store_id: int | None = None,
                  keyword: str = "", category_id: int | None = None, export: bool = False, db: Session = Depends(get_db),
                  _: User = Depends(require("reports"))):
    """按商品规格汇总卖了多少件；点开某一行看逐单明细（/product-sales/detail）。可按分类筛选。"""
    b, e, start, stop = _range(begin, end)
    pids = category_product_ids(db, category_id) if category_id else None
    agg = {}
    for ln in _sales(db, start, stop, store_id, keyword, product_ids=pids):
        r = agg.setdefault(ln["sku_id"], {"sku_id": ln["sku_id"], "product_name": ln["product_name"],
                                          "sku_name": ln["sku_name"], "sold_qty": 0, "refund_qty": 0, "net_qty": 0,
                                          "amount": 0, "discount": 0, "paid": 0, "refund": 0, "net": 0,
                                          "cost": 0, "orders": set()})
        if ln["type"] == "sale":
            r["sold_qty"] += ln["qty"]
            r["amount"] += ln["amount"]
            r["discount"] += ln["discount"]
            r["paid"] += ln["paid"]
            r["orders"].add(ln["order_id"])
        else:
            r["refund_qty"] += -ln["qty"]
            r["refund"] += -ln["paid"]
        r["cost"] += ln["cost"]
    rows = []
    for r in sorted(agg.values(), key=lambda r: (-r["sold_qty"], r["product_name"])):
        r["net_qty"] = r["sold_qty"] - r["refund_qty"]
        r["net"] = r["paid"] - r["refund"]
        r["order_count"] = len(r.pop("orders"))
        rows.append(r)
    if export:
        header = ["商品", "规格", "销售件数", "退货件数", "净件数", "原价金额", "优惠", "实收", "退款", "净收", "成本", "单数"]
        out = [[r["product_name"], r["sku_name"], r["sold_qty"], r["refund_qty"], r["net_qty"], y(r["amount"]),
                y(r["discount"]), y(r["paid"]), y(r["refund"]), y(r["net"]), y(r["cost"]), r["order_count"]] for r in rows]
        return _xlsx("商品销售", header, out, f"商品销售汇总_{b}_{e}")
    return {"begin": b.isoformat(), "end": e.isoformat(), "rows": rows}


@router.get("/category-sales")
def category_sales(begin: date | None = None, end: date | None = None, store_id: int | None = None, export: bool = False,
                   db: Session = Depends(get_db), _: User = Depends(require("reports"))):
    """按分类汇总销售。大类包含它下面小类的商品；一个商品放在多个分类里时，在每个分类里都计算一次，
    所以各分类相加可能大于总数。"""
    from ..models import Category, Product
    b, e, start, stop = _range(begin, end)
    cats = db.scalars(select(Category).order_by(Category.sort, Category.id)).all()
    parent = {c.id: c.parent_id for c in cats}
    prod_cats: dict[int, set[int]] = {}
    for p in db.scalars(select(Product)):
        ids = {c.id for c in p.categories} | ({p.category_id} if p.category_id else set())
        full = set(ids) | {parent[i] for i in ids if parent.get(i)}
        prod_cats[p.id] = full
    item_product = {}
    agg: dict = {}

    def bucket(cid):
        return agg.setdefault(cid, {"category_id": cid, "sold_qty": 0, "refund_qty": 0, "paid": 0, "refund": 0, "orders": set(), "products": set()})
    for ln in _sales(db, start, stop, store_id, ""):
        pid = item_product.get(ln["sku_id"])
        if pid is None:
            from ..models import Sku
            sku = db.get(Sku, ln["sku_id"])
            pid = item_product[ln["sku_id"]] = sku.product_id if sku else None
        for cid in (prod_cats.get(pid) or {0}):
            r = bucket(cid)
            if ln["type"] == "sale":
                r["sold_qty"] += ln["qty"]
                r["paid"] += ln["paid"]
                r["orders"].add(ln["order_id"])
            else:
                r["refund_qty"] += -ln["qty"]
                r["refund"] += -ln["paid"]
            r["products"].add(pid)
    names = {c.id: c.name for c in cats}
    rows = []
    order = [c.id for c in cats if not c.parent_id]
    order = [x for cid in order for x in [cid] + [c.id for c in cats if c.parent_id == cid]] + [c.id for c in cats if c.parent_id and c.parent_id not in names] + [0]
    for cid in order:
        r = agg.get(cid)
        if not r:
            continue
        rows.append({"category_id": cid or None, "name": names.get(cid, "未分类"), "parent_id": parent.get(cid),
                     "sold_qty": r["sold_qty"], "refund_qty": r["refund_qty"], "net_qty": r["sold_qty"] - r["refund_qty"],
                     "paid": r["paid"], "refund": r["refund"], "net": r["paid"] - r["refund"],
                     "order_count": len(r["orders"]), "product_count": len(r["products"])})
    if export:
        header = ["分类", "商品数", "销售件数", "退货件数", "净件数", "实收", "退款", "净收", "单数"]
        out = [[("　" if r["parent_id"] else "") + r["name"], r["product_count"], r["sold_qty"], r["refund_qty"], r["net_qty"],
                y(r["paid"]), y(r["refund"]), y(r["net"]), r["order_count"]] for r in rows]
        return _xlsx("分类销售", header, out, f"分类销售汇总_{b}_{e}")
    return {"begin": b.isoformat(), "end": e.isoformat(), "rows": rows}


@router.get("/product-sales/detail")
def product_sales_detail(sku_id: int | None = None, begin: date | None = None, end: date | None = None,
                         store_id: int | None = None, keyword: str = "", category_id: int | None = None, export: bool = False,
                         page: int = 1, size: int = 100,
                         db: Session = Depends(get_db), _: User = Depends(require("reports"))):
    b, e, start, stop = _range(begin, end)
    pids = category_product_ids(db, category_id) if category_id else None
    lines = _sales(db, start, stop, store_id, keyword, sku_id, product_ids=pids)
    total = len(lines)
    if export:
        header = ["时间", "类型", "单号", "退款单号", "门店", "区域/位置", "商品", "规格", "数量", "单价", "原价金额", "优惠", "实收"]
        out = [[l["time"].strftime("%Y-%m-%d %H:%M:%S"), l["type_text"], l["order_no"], l.get("refund_no", ""),
                l["store_name"], l["area"], l["product_name"], l["sku_name"], l["qty"], y(l["unit_price"]),
                y(l["amount"]), y(l["discount"]), y(l["paid"])] for l in lines]
        return _xlsx("逐单明细", header, out, f"商品销售明细_{b}_{e}")
    # 导出给全部；页面上分页显示，合计按全部明细算
    sums = {"qty": sum(l["qty"] for l in lines), "amount": sum(l["amount"] for l in lines),
            "discount": sum(l["discount"] for l in lines), "paid": sum(l["paid"] for l in lines)}
    size = max(1, min(size, 1000))
    rows = lines[(max(page, 1) - 1) * size: max(page, 1) * size]
    for l in rows:
        l["time"] = l["time"].strftime("%Y-%m-%d %H:%M:%S")
    return {"begin": b.isoformat(), "end": e.isoformat(), "total": total, "page": page, "size": size, "sums": sums,
            "rows": rows}
