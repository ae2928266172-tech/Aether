"""营收报表改成在数据库里按“天 × 门店”汇总后，结果要和逐单逐行在内存里算的完全一样；一次最多查一年。"""
import datetime as dt
from collections import defaultdict

from test_exchange import checkout, ex


def _reference(db, start, stop, group):
    """改造前的算法：把订单、商品行、收款、退货行逐条读出来累加。用来核对 SQL 汇总的结果。"""
    from sqlalchemy import select

    from app.models import Order, OrderItem, Payment, Refund, RefundLine
    from app.routers.reports import _bucket
    data = defaultdict(lambda: defaultdict(int))
    for o in db.scalars(select(Order).where(Order.paid_at >= start, Order.paid_at < stop)):
        r = data[(_bucket(o.paid_at.date(), group), o.store_id)]
        r["orders"] += 1
        r["pos_orders" if o.source == "pos" else "online_orders"] += 1
        r["original"] += o.original_amount
        r["discount"] += o.original_amount - o.payable_amount
        r["qty"] += sum(i.qty for i in o.items if i.added_at is None)
        r["cost"] += sum(i.unit_cost * i.qty for i in o.items if i.added_at is None)
    for it, sid in db.execute(select(OrderItem, Order.store_id).join(Order, Order.id == OrderItem.order_id)
                              .where(OrderItem.added_at >= start, OrderItem.added_at < stop)):
        r = data[(_bucket(it.added_at.date(), group), sid)]
        r["original"] += it.amount
        r["discount"] += it.amount - it.paid_share
        r["qty"] += it.qty
        r["cost"] += it.unit_cost * it.qty
    for p, sid in db.execute(select(Payment, Order.store_id).join(Order, Order.id == Payment.order_id)
                             .where(Payment.created_at >= start, Payment.created_at < stop)):
        r = data[(_bucket(p.created_at.date(), group), sid)]
        sign = 1 if p.kind == "pay" else -1
        r["received" if sign > 0 else "refunded"] += p.amount
        r["m_" + p.method] += sign * p.amount
    for ln, at, sid, cost in db.execute(
            select(RefundLine, Refund.created_at, Order.store_id, OrderItem.unit_cost)
            .join(Refund, Refund.id == RefundLine.refund_id).join(Order, Order.id == Refund.order_id)
            .join(OrderItem, OrderItem.id == RefundLine.order_item_id)
            .where(Refund.created_at >= start, Refund.created_at < stop)):
        r = data[(_bucket(at.date(), group), sid)]
        r["refund_qty"] += ln.qty
        r["cost"] -= cost * ln.qty
    return data


def _shift(model, oid, days, *cols):
    """把某条记录的时间往前挪几天，造出跨天、跨周、跨月的数据。"""
    from app import db as dbmod
    with dbmod.SessionLocal() as s:
        obj = s.get(model, oid)
        for c in cols:
            setattr(obj, c, getattr(obj, c) - dt.timedelta(days=days))
        s.commit()


def test_revenue_sql_matches_reference(client, admin, world):
    from app import db as dbmod
    from app.models import Order, Payment
    w = world
    today = dbmod.now().date()
    o1 = checkout(admin, w, [(w["small"]["id"], 3), (w["big"]["id"], 1)], 4800)
    o2 = admin.post("/api/pos/checkout", {"store_id": w["s2"]["id"], "lines": [{"sku_id": w["small"]["id"], "qty": 2}],
                                          "payments": [{"method": "wechat", "amount": 1500}], "payable": 1500})
    o3 = checkout(admin, w, [(w["big"]["id"], 2)], 3600)
    # o1 挪到 40 天前（跨月）、o2 挪到 9 天前（跨周），o3 留在今天
    for o, days in ((o1, 40), (o2, 9)):
        _shift(Order, o["id"], days, "paid_at", "created_at")
        with dbmod.SessionLocal() as s:
            for p in s.query(Payment).filter(Payment.order_id == o["id"]):
                p.created_at -= dt.timedelta(days=days)
            s.commit()
    # 今天：o1 退 1 件小份、o3 换货（一件大份换两份冰水，差价退还）
    admin.post(f"/api/orders/{o1['id']}/refund", {"lines": [{"order_item_id": o1["items"][0]["id"], "qty": 1}]})
    ex(admin, o3["id"], [(o3["items"][0]["id"], 1)], [(w["ice"]["skus"][0]["id"], 2)], method="cash")

    begin, end = (today - dt.timedelta(days=60)).isoformat(), today.isoformat()
    start = dt.datetime.combine(today - dt.timedelta(days=60), dt.time.min)
    stop = dt.datetime.combine(today + dt.timedelta(days=1), dt.time.min)
    for group in ("day", "week", "month"):
        got = admin.get("/api/reports/revenue", begin=begin, end=end, group=group)
        with dbmod.SessionLocal() as s:
            ref = _reference(s, start, stop, group)
        assert len(got["rows"]) == len(ref) >= 2
        for r in got["rows"]:
            exp = ref[(r["period"], r["store_id"])]
            for k in ("orders", "pos_orders", "online_orders", "original", "discount", "received", "refunded",
                      "qty", "refund_qty", "cost"):
                assert r[k] == exp[k], (group, r["period"], k, r[k], exp[k])
            for m, v in r["methods"].items():
                assert v == exp["m_" + m], (group, r["period"], m)
        # 合计行与逐行相加一致
        assert got["total"]["net"] == sum(r["net"] for r in got["rows"])
    # 换货换进来的冰水按今天计，o2 只在二号店
    rows = admin.get("/api/reports/revenue", begin=end, end=end)["rows"]
    assert {r["store_id"] for r in rows} == {w["s1"]["id"]}
    assert admin.get("/api/reports/revenue", begin=begin, end=end, export=True).headers["content-type"].startswith(
        "application/vnd.openxmlformats")


def test_report_range_limited_to_one_year(admin, world):
    for url in ("/api/reports/revenue", "/api/reports/product-sales", "/api/reports/category-sales",
                "/api/reports/product-sales/detail"):
        admin.get(url, begin="2026-01-01", end="2026-12-31")  # 整一年可以查（闰年 366 天也行）
        admin.get(url, begin="2024-01-01", end="2024-12-31")
        r = admin.get(url, begin="2025-01-01", end="2026-01-02", expect=400)
        assert "一年" in r["detail"]
