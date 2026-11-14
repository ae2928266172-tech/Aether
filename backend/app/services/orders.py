"""订单服务：门店收银、小程序下单、接单、收款、取消、退货退款。

一致性规则：
- 订单只在 stock_deducted=True 时才回补库存，回补后置为 False（取消）或按退货数量回补，避免重复扣减 / 回补。
- 已收款的订单不能再收款；未收款的订单不能退款；已收款的订单不能直接取消，要走退货退款。
- 带 request_id 的请求只生效一次（网络重试、重复点击）。
- 打折 / 调低应收只影响本单应收，不改商品售价；库存按实际件数 × 扣减量扣。
"""
import uuid
from collections import defaultdict
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import now
from ..models import (Area, Order, OrderItem, OrderLog, Payment, Product, Refund, RefundLine, Sku,
                      StockItem, Store, User)
from ..security import has_perm
from ..settings_store import get_setting
from .inventory import change_stock

PAY_METHODS = {"cash": "现金", "wechat": "微信", "alipay": "支付宝", "other": "其他"}
STATUS_TEXT = {"pending": "待接单", "accepted": "已接单", "completed": "已完成", "cancelled": "已取消"}
PAY_STATUS_TEXT = {"unpaid": "未收款", "paid": "已收款", "partial_refunded": "部分退款", "refunded": "已退款"}


def _no(prefix: str) -> str:
    return f"{prefix}{now():%Y%m%d%H%M%S}{uuid.uuid4().hex[:4].upper()}"


def log(db: Session, order: Order, action: str, detail: str = "", user: User | None = None):
    db.add(OrderLog(order_id=order.id, action=action, detail=detail, created_by=user.id if user else None))


def _by_request(db: Session, model, request_id: str | None):
    if not request_id:
        return None
    return db.scalar(select(model).where(model.request_id == request_id))


def build_items(db: Session, lines: list[dict], online: bool) -> list[OrderItem]:
    if not lines:
        raise HTTPException(400, "请选择商品")
    qty_by_sku: dict[int, int] = defaultdict(int)
    for ln in lines:
        q = int(ln["qty"])
        if q <= 0:
            raise HTTPException(400, "数量必须大于 0")
        qty_by_sku[int(ln["sku_id"])] += q
    items = []
    for sku_id, qty in qty_by_sku.items():
        sku = db.get(Sku, sku_id)
        if not sku or not sku.active or not sku.product.active:
            raise HTTPException(400, f"商品已下架或不存在（规格 {sku_id}）")
        p: Product = sku.product
        if online and not p.online_visible:
            raise HTTPException(400, f"{p.name} 不支持线上购买")
        stock: StockItem | None = sku.stock_item
        unit_cost = sku.cost if sku.cost is not None else (
            int((Decimal(stock.cost) * Decimal(sku.deduct_qty)).to_integral_value()) if stock else 0)
        items.append(OrderItem(
            product_id=p.id, sku_id=sku.id, product_name=p.name, sku_name=sku.name, unit=p.unit,
            qty=qty, unit_price=sku.price, amount=sku.price * qty, paid_share=sku.price * qty,
            unit_cost=unit_cost, stock_item_id=sku.stock_item_id, deduct_qty=sku.deduct_qty,
            medical_info={k: getattr(p, k) for k in
                          ("reg_cert_no", "production_license_no", "registrant", "production_address")
                          if getattr(p, k)}))
    return items


def discount_limits(user: User) -> tuple[int, int | None]:
    """（最低折扣，单笔最多调低金额）。账号单独设置优先，否则用角色设置。"""
    rate = user.min_discount_rate if user.min_discount_rate is not None else (user.role.min_discount_rate or 1)
    adj = user.max_adjust_amount if user.max_adjust_amount is not None else user.role.max_adjust_amount
    return rate, adj


def apply_pricing(order: Order, user: User | None, discount_rate: int | None, payable: int | None):
    """计算本次应收。discount_rate 如 95 表示 9.5 折；payable 为直接改后的应收（分）。"""
    original = sum(i.amount for i in order.items)
    order.original_amount = original
    target = original
    order.discount_rate = None
    if discount_rate is not None and discount_rate != 100:
        if user is None or not has_perm(user, "discount"):
            raise HTTPException(403, "没有打折权限")
        if not (1 <= discount_rate < 100):
            raise HTTPException(400, "折扣须在 0.1 折到 9.9 折之间")
        order.discount_rate = discount_rate
        target = int((Decimal(original) * discount_rate / 100).quantize(Decimal(1), rounding="ROUND_HALF_UP"))
    if payable is not None and payable != target:
        if user is None or not has_perm(user, "adjust_amount"):
            raise HTTPException(403, "没有调整应收金额的权限")
        if payable > target:
            raise HTTPException(400, "只能调低应收金额，不能高于" + ("折后金额" if order.discount_rate else "商品金额"))
        if payable < 0:
            raise HTTPException(400, "应收金额不能为负数")
        max_adjust = discount_limits(user)[1]
        if max_adjust is not None and target - payable > max_adjust:
            raise HTTPException(403, f"你的权限单笔最多调低 {max_adjust / 100:.2f} 元")
        target = payable
    if user is not None and target < original:
        min_rate = discount_limits(user)[0]
        floor = -(-original * min_rate // 100)  # 向上取整
        if target < floor:
            raise HTTPException(403, f"你的权限最低只能打 {min_rate / 10:g} 折，本单应收不能低于 {floor / 100:.2f} 元")
    order.payable_amount = target
    _allocate(order.items, target)


def _allocate(items: list[OrderItem], total: int):
    """按原价比例把实收分摊到每行（最大余数法），保证合计正好等于实收。"""
    base = sum(i.amount for i in items)
    if base == 0:
        for i in items:
            i.paid_share = 0
        return
    shares = []
    for i in items:
        exact = Decimal(i.amount) * total / base
        shares.append([i, int(exact), exact - int(exact)])
    left = total - sum(s[1] for s in shares)
    for s in sorted(shares, key=lambda s: s[2], reverse=True)[:left]:
        s[1] += 1
    for i, v, _ in shares:
        i.paid_share = v


def deduct_stock(db: Session, order: Order, allow_negative: bool, user: User | None):
    if order.stock_deducted:
        return
    loc = order.store.location_id
    need: dict[int, Decimal] = defaultdict(Decimal)
    for i in order.items:
        if i.stock_item_id:
            need[i.stock_item_id] += Decimal(i.deduct_qty) * i.qty
    for sid, q in need.items():
        change_stock(db, location_id=loc, stock_item_id=sid, qty=-q, kind="sale", order_id=order.id,
                     allow_negative=allow_negative, user_id=user.id if user else None)
    order.stock_deducted = True


def restore_stock(db: Session, order: Order, qty_by_item: dict[int, int], user: User | None):
    if not order.stock_deducted:
        return
    loc = order.store.location_id
    back: dict[int, Decimal] = defaultdict(Decimal)
    for i in order.items:
        q = qty_by_item.get(i.id, 0)
        if q and i.stock_item_id:
            back[i.stock_item_id] += Decimal(i.deduct_qty) * q
    for sid, q in back.items():
        change_stock(db, location_id=loc, stock_item_id=sid, qty=q, kind="sale_return", order_id=order.id,
                     user_id=user.id if user else None)


def _record_payments(db: Session, order: Order, payments: list[dict], user: User | None):
    if not payments:
        raise HTTPException(400, "请选择收款方式")
    total = 0
    rows = []
    for p in payments:
        method = p.get("method")
        if method not in PAY_METHODS:
            raise HTTPException(400, "收款方式错误")
        amount = int(p["amount"])
        if amount < 0:
            raise HTTPException(400, "收款金额不能为负数")
        received = int(p.get("received") or amount)
        if method == "cash" and received < amount:
            raise HTTPException(400, "现金实收不能少于应收")
        if method != "cash":
            received = amount
        total += amount
        rows.append(Payment(order_id=order.id, kind="pay", method=method, amount=amount, received=received,
                            change=received - amount, created_by=user.id if user else None))
    if total != order.payable_amount:
        raise HTTPException(400, f"收款合计 {total / 100:.2f} 元与应收 {order.payable_amount / 100:.2f} 元不一致")
    for r in rows:
        db.add(r)
    order.paid_amount = total
    order.pay_status = "paid"
    order.paid_at = now()


def get_order(db: Session, order_id: int, lock: bool = False) -> Order:
    q = select(Order).where(Order.id == order_id)
    if lock:
        q = q.with_for_update()
    o = db.scalar(q)
    if not o:
        raise HTTPException(404, "订单不存在")
    return o


# ---------------- 门店收银 ----------------

def pos_checkout(db: Session, user: User, store: Store, lines: list[dict], payments: list[dict],
                 discount_rate: int | None = None, payable: int | None = None, remark: str = "",
                 request_id: str | None = None) -> Order:
    exist = _by_request(db, Order, request_id)
    if exist:
        return exist
    order = Order(no=_no("S"), source="pos", store_id=store.id, status="completed", remark=remark,
                  created_by=user.id, request_id=request_id)
    order.items = build_items(db, lines, online=False)
    order.store = store
    apply_pricing(order, user, discount_rate, payable)
    db.add(order)
    db.flush()
    _record_payments(db, order, payments, user)
    rules = get_setting(db, "rules")
    deduct_stock(db, order, rules["pos_allow_negative"], user)
    order.accepted_at = order.completed_at = now()
    order.accepted_by = user.id
    log(db, order, "收银", f"应收 {order.payable_amount / 100:.2f}", user)
    db.flush()
    return order


# ---------------- 小程序订单 ----------------

def online_create(db: Session, customer_id: int, area: Area, lines: list[dict], location_note: str = "",
                  contact_phone: str = "", remark: str = "", request_id: str | None = None) -> Order:
    exist = _by_request(db, Order, request_id)
    if exist:
        if exist.customer_id != customer_id:
            raise HTTPException(409, "请求号重复")
        return exist
    store = area.store
    if not area.active or not store.active:
        raise HTTPException(400, "该区域暂停接单")
    if not store.accept_online_orders:
        raise HTTPException(400, "门店暂不接受线上订单")
    rules = get_setting(db, "rules")
    if rules["online_location_required"] and not location_note.strip():
        raise HTTPException(400, f"请填写{rules['location_label']}")
    order = Order(no=_no("W"), source="online", store_id=store.id, area_id=area.id, area_name=area.name,
                  location_note=location_note.strip(), customer_id=customer_id, contact_phone=contact_phone,
                  remark=remark, status="pending", request_id=request_id)
    order.items = build_items(db, lines, online=True)
    order.store = store
    apply_pricing(order, None, None, None)
    db.add(order)
    db.flush()
    if rules["online_deduct_on"] == "create":
        deduct_stock(db, order, rules["online_allow_negative"], None)
    log(db, order, "下单", f"{area.name} {location_note}")
    db.flush()
    return order


def accept(db: Session, order: Order, user: User) -> Order:
    if order.status == "accepted" or order.status == "completed":
        return order  # 重复点击接单，不重复处理
    if order.status != "pending":
        raise HTTPException(409, f"订单{STATUS_TEXT[order.status]}，不能接单")
    rules = get_setting(db, "rules")
    if not order.stock_deducted:
        deduct_stock(db, order, rules["online_allow_negative"] if order.source == "online"
                     else rules["pos_allow_negative"], user)
    order.status = "accepted"
    order.accepted_at = now()
    order.accepted_by = user.id
    log(db, order, "接单", "", user)
    db.flush()
    return order


def collect(db: Session, order: Order, user: User, payments: list[dict], discount_rate: int | None = None,
            payable: int | None = None) -> Order:
    if order.pay_status != "unpaid":
        raise HTTPException(409, "订单已收款，不能重复收款")
    if order.status == "cancelled":
        raise HTTPException(409, "订单已取消，不能收款")
    if order.status == "pending":
        accept(db, order, user)
    apply_pricing(order, user, discount_rate, payable)
    _record_payments(db, order, payments, user)
    order.status = "completed"
    order.completed_at = now()
    log(db, order, "收款", f"应收 {order.payable_amount / 100:.2f}", user)
    db.flush()
    return order


def cancel(db: Session, order: Order, user: User | None, reason: str = "", by_customer: bool = False) -> Order:
    if order.status == "cancelled":
        return order
    if order.pay_status != "unpaid":
        raise HTTPException(409, "订单已收款，请走退货退款")
    if by_customer and order.status != "pending":
        raise HTTPException(409, "门店已接单，请联系门店取消")
    if order.status not in ("pending", "accepted"):
        raise HTTPException(409, f"订单{STATUS_TEXT[order.status]}，不能取消")
    restore_stock(db, order, {i.id: i.qty for i in order.items}, user)
    order.stock_deducted = False
    order.status = "cancelled"
    order.cancelled_at = now()
    order.cancel_reason = reason
    log(db, order, "取消", ("顾客取消 " if by_customer else "") + reason, user)
    db.flush()
    return order


def refund(db: Session, order: Order, user: User, lines: list[dict], restock: bool = True,
           method: str | None = None, reason: str = "", amount: int | None = None,
           request_id: str | None = None) -> Refund:
    """退货退款。lines=[{order_item_id, qty}]；不传 amount 时按实收分摊自动计算。"""
    exist = _by_request(db, Refund, request_id)
    if exist:
        return exist
    if order.pay_status not in ("paid", "partial_refunded"):
        raise HTTPException(409, "订单未收款或已全额退款，不能退款")
    items = {i.id: i for i in order.items}
    refunded_amt_by_item = dict(db.execute(
        select(RefundLine.order_item_id, func.sum(RefundLine.amount))
        .join(Refund, Refund.id == RefundLine.refund_id).where(Refund.order_id == order.id)
        .group_by(RefundLine.order_item_id)).all())
    rlines = []
    qty_map: dict[int, int] = defaultdict(int)
    for ln in lines:
        qty_map[int(ln["order_item_id"])] += int(ln["qty"])
    calc_total = 0
    for iid, q in qty_map.items():
        it = items.get(iid)
        if not it:
            raise HTTPException(400, "退货商品不属于该订单")
        if q <= 0:
            continue
        if q > it.qty - it.refunded_qty:
            raise HTTPException(400, f"{it.product_name} 最多还能退 {it.qty - it.refunded_qty} 件")
        if q + it.refunded_qty == it.qty:
            amt = it.paid_share - (refunded_amt_by_item.get(iid) or 0)
        else:
            amt = it.paid_share * q // it.qty
        calc_total += amt
        rlines.append((it, q, amt))
    if not rlines:
        raise HTTPException(400, "请选择退货商品和数量")
    remaining = order.paid_amount - order.refunded_amount
    if amount is None:
        amount = calc_total
    if amount < 0 or amount > remaining:
        raise HTTPException(400, f"退款金额须在 0 到 {remaining / 100:.2f} 元之间")
    if amount != calc_total:
        # 自定义退款金额时，按比例重新分摊到各行，便于商品统计
        fake = [OrderItem(amount=a) for _, _, a in rlines]
        _allocate(fake, amount)
        rlines = [(it, q, f.paid_share) for (it, q, _), f in zip(rlines, fake)]
    if method is None:
        pays = [p for p in order.payments if p.kind == "pay"]
        method = pays[0].method if pays else "cash"
    if method not in PAY_METHODS:
        raise HTTPException(400, "退款方式错误")
    rf = Refund(no=_no("T"), order_id=order.id, amount=amount, restock=restock, reason=reason,
                created_by=user.id, request_id=request_id)
    db.add(rf)
    db.flush()
    for it, q, amt in rlines:
        db.add(RefundLine(refund_id=rf.id, order_item_id=it.id, qty=q, amount=amt))
        it.refunded_qty += q
    if restock:
        restore_stock(db, order, {it.id: q for it, q, _ in rlines}, user)
    db.add(Payment(order_id=order.id, kind="refund", method=method, amount=amount, received=amount,
                   created_by=user.id, refund_id=rf.id))
    order.refunded_amount += amount
    all_back = all(i.refunded_qty == i.qty for i in order.items)
    order.pay_status = "refunded" if all_back else "partial_refunded"
    log(db, order, "退款", f"退 {amount / 100:.2f} 元" + ("，商品回库存" if restock else "，商品不回库存")
        + (f"，{reason}" if reason else ""), user)
    db.flush()
    db.refresh(rf)
    return rf
