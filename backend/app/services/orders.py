"""订单服务：门店收银、小程序下单、接单、收款、取消、退货退款。

一致性规则：
- 订单只在 stock_deducted=True 时才回补库存，回补后置为 False（取消）或按退货数量回补，避免重复扣减 / 回补。
- 已收款的订单不能再收款；未收款的订单不能退款；已收款的订单不能直接取消，要走退货退款。
- 带 request_id 的请求只生效一次（网络重试、重复点击）。
- 打折 / 调低应收只影响本单应收，不改商品售价；库存按实际件数 × 扣减量扣。
"""
import uuid
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import now
from ..models import (Area, Exchange, Location, Order, OrderItem, OrderLog, Payment, Product, Refund, RefundLine,
                      Sku, StockItem, Store, User)
from ..security import has_perm
from ..settings_store import get_setting
from .inventory import change_stock, defective_location, find_batch, lock_balances, return_alloc
from .printq import auto_enqueue

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


def _qty_map(pairs) -> dict[int, int]:
    m: dict[int, int] = defaultdict(int)
    for k, q in pairs:
        m[int(k)] += int(q)
    return {k: v for k, v in m.items() if v}


def same_request(ok: bool):
    """请求号查到了已有记录，但不是同一个人、同一家店、同一张单、同样的内容：不返回别人的结果。"""
    if not ok:
        raise HTTPException(409, "这个请求号已经被别的操作用过，请刷新页面后重试")


def once(db: Session, run):
    """执行并提交一次带请求号的操作。两个相同请求同时到达时，后一个会撞上请求号唯一约束：
    回滚后再执行一次，这次会查到前一个的结果（并核对归属）直接返回，而不是报错。"""
    from sqlalchemy.exc import IntegrityError
    try:
        r = run()
        db.commit()
        return r
    except IntegrityError:
        db.rollback()
        r = run()
        db.commit()
        return r


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
        if not (0 <= discount_rate < 100):
            raise HTTPException(400, "折扣须在 0 折到 9.9 折之间")
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
    min_rate = discount_limits(user)[0] if user is not None else 1
    # 最低折扣 1（0.1 折）及以下表示“折扣不限”：可以一直打到 0 元（2026-11-21 Aether 确认）
    if user is not None and target < original and min_rate > 1:
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
    for sid, q in sorted(need.items()):  # 按库存品排序加锁：多台同时卖相同几样时不会互相等成死锁
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
    for sid, q in sorted(back.items()):
        change_stock(db, location_id=loc, stock_item_id=sid, qty=q, kind="sale_return", order_id=order.id,
                     user_id=user.id if user else None, alloc=return_alloc(db, order.id, loc, sid, q))


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
        # 没传实收才按应收算；传了 0 就是 0（以前 0 会被当成“没传”，现金实收 0 也能收款）
        received = amount if p.get("received") is None else int(p["received"])
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
        q = q.with_for_update(of=Order)
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
        same_request(exist.source == "pos" and exist.store_id == store.id and exist.created_by == user.id
                     and _qty_map((i.sku_id, i.qty) for i in exist.items)
                     == _qty_map((ln["sku_id"], ln["qty"]) for ln in lines))
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
    auto_enqueue(db, order, user)
    return order


# ---------------- 小程序订单 ----------------

def online_create(db: Session, customer_id: int, area: Area, lines: list[dict], location_note: str = "",
                  contact_phone: str = "", remark: str = "", request_id: str | None = None) -> Order:
    exist = _by_request(db, Order, request_id)
    if exist:
        same_request(exist.source == "online" and exist.customer_id == customer_id and exist.area_id == area.id
                     and _qty_map((i.sku_id, i.qty) for i in exist.items)
                     == _qty_map((ln["sku_id"], ln["qty"]) for ln in lines))
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
    from .area_rules import check_order
    check_order(db, area, order.items)
    order.store = store
    apply_pricing(order, None, None, None)
    db.add(order)
    db.flush()
    if rules["online_deduct_on"] == "create":
        deduct_stock(db, order, rules["online_allow_negative"], None)
    log(db, order, "下单", f"{area.name} {location_note}")
    db.flush()
    auto_enqueue(db, order)
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


def modify(db: Session, order: Order, user: User, lines: list[dict], reason: str = "") -> Order:
    """改单：未收款的订单直接改商品（减数量、删商品、换规格、加商品），不用取消再重新下单。

    lines 是改完后的完整商品清单 [{sku_id, qty}]。已扣过库存的，先按原订单全部退回，再按新清单重新扣，
    批次 / 成本跟着走，不会重复扣减。已收款的订单不能改，请走退货退款。
    """
    if order.status == "cancelled":
        raise HTTPException(409, "订单已取消，不能修改")
    if order.pay_status != "unpaid":
        raise HTTPException(409, "订单已收款，不能修改；要退部分商品请用“退货退款”")
    lines = [ln for ln in lines if int(ln["qty"]) > 0]
    if not lines:
        raise HTTPException(400, "订单里至少要留一件商品；全部不要了请取消订单")
    old = {}
    for i in order.items:
        old[i.sku_id] = old.get(i.sku_id, 0) + i.qty
    new_items = build_items(db, lines, online=False)
    new = {i.sku_id: i.qty for i in new_items}
    if old == new:
        raise HTTPException(400, "订单没有变化")
    rules = get_setting(db, "rules")
    was_deducted = order.stock_deducted
    if was_deducted:
        restore_stock(db, order, {i.id: i.qty for i in order.items}, user)
        order.stock_deducted = False
    names = {}
    for i in order.items:
        names[i.sku_id] = i.product_name + ("·" + i.sku_name if i.sku_name and i.sku_name != "默认" else "")
        db.delete(i)
    db.flush()
    order.items = new_items
    for i in new_items:
        names[i.sku_id] = i.product_name + ("·" + i.sku_name if i.sku_name and i.sku_name != "默认" else "")
    apply_pricing(order, None, None, None)
    db.flush()
    if was_deducted:
        deduct_stock(db, order, rules["online_allow_negative"] if order.source == "online"
                     else rules["pos_allow_negative"], user)
    changes = []
    for sid in list(old) + [s for s in new if s not in old]:
        a, b = old.get(sid, 0), new.get(sid, 0)
        if a != b:
            changes.append(f"{names[sid]} {a}→{b}" if a and b else (f"去掉 {names[sid]}×{a}" if a else f"加 {names[sid]}×{b}"))
    detail = "；".join(changes) + f"；应收 {order.payable_amount / 100:.2f}" + (f"；{reason}" if reason else "")
    log(db, order, "改单", detail, user)
    from .. import audit
    audit.record(db, user, "改单", order.no, summary=detail)
    db.flush()
    return order


def _check_refund_days(db: Session, order: Order, user: User, what: str):
    days = int(get_setting(db, "rules").get("refund_days") or 0)
    if days and not user.role.is_admin and order.paid_at and now() - order.paid_at > timedelta(days=days):
        raise HTTPException(403, f"超过 {days} 天的订单不能{what}，请联系管理员")


def _check_adjust(user: User, original: int, amount: int):
    """换出商品调低成交金额：和收银调低应收同样的权限（调整金额权限、单笔上限、最低折扣）。"""
    if amount == original:
        return
    if not has_perm(user, "adjust_amount"):
        raise HTTPException(403, "没有调整金额的权限")
    if amount > original:
        raise HTTPException(400, "换出商品金额只能调低，不能高于现价")
    if amount < 0:
        raise HTTPException(400, "金额不能为负数")
    min_rate, max_adjust = discount_limits(user)
    if max_adjust is not None and original - amount > max_adjust:
        raise HTTPException(403, f"你的权限单笔最多调低 {max_adjust / 100:.2f} 元")
    if min_rate > 1:
        floor = -(-original * min_rate // 100)
        if amount < floor:
            raise HTTPException(403, f"你的权限最低只能打 {min_rate / 10:g} 折，换出商品金额不能低于 {floor / 100:.2f} 元")


def _exchange_calc(db: Session, order: Order, user: User | None, returns: list[dict], items: list[dict],
                   new_amount: int | None):
    """算换货：退回哪些行各多少件、各按原实收值多少钱；换出的新商品（现价）；成交金额和差价。"""
    if order.status == "cancelled" or order.pay_status not in ("paid", "partial_refunded"):
        raise HTTPException(409, "只有已收款的订单可以换货；未收款的订单请用“修改订单”")
    by_id = {i.id: i for i in order.items}
    want: dict[int, int] = defaultdict(int)
    for r in returns:
        if int(r["qty"]) > 0:
            want[int(r["order_item_id"])] += int(r["qty"])
    if not want:
        raise HTTPException(400, "请选择要退回的商品和件数")
    refunded_amt = dict(db.execute(
        select(RefundLine.order_item_id, func.sum(RefundLine.amount))
        .join(Refund, Refund.id == RefundLine.refund_id).where(Refund.order_id == order.id)
        .group_by(RefundLine.order_item_id)).all())
    back = []
    for iid, q in want.items():
        it = by_id.get(iid)
        if not it:
            raise HTTPException(400, "退回的商品不属于该订单")
        left = it.qty - it.refunded_qty  # 已退货、已换出的都算进 refunded_qty
        if q > left:
            raise HTTPException(400, f"{it.product_name} 最多还能退换 {left} 件")
        # 按原单实际分摊的实收算（扣掉整单折扣），和退货同一算法
        amt = it.paid_share - (refunded_amt.get(iid) or 0) if q == left else it.paid_share * q // it.qty
        back.append((it, q, amt))
    lines = [{"sku_id": int(x["sku_id"]), "qty": int(x["qty"])} for x in items if int(x["qty"]) > 0]
    if not lines:
        raise HTTPException(400, "请选择要换成的商品和件数")
    new = build_items(db, lines, online=False)
    old_amount = sum(a for _, _, a in back)
    new_original = sum(i.amount for i in new)
    amount = new_original if new_amount is None else int(new_amount)
    if user is not None:
        _check_adjust(user, new_original, amount)
    _allocate(new, amount)
    return back, new, old_amount, new_original, amount, amount - old_amount


def exchange_quote(db: Session, order: Order, user: User, returns: list[dict], items: list[dict],
                   new_amount: int | None = None) -> dict:
    back, new, old_amount, new_original, amount, diff = _exchange_calc(db, order, user, returns, items, new_amount)
    return {"old_amount": old_amount, "new_original": new_original, "new_amount": amount, "diff": diff,
            "returns": [{"order_item_id": it.id, "qty": q, "amount": a} for it, q, a in back],
            "items": [{"sku_id": i.sku_id, "name": i.product_name, "sku_name": i.sku_name, "qty": i.qty,
                       "unit_price": i.unit_price, "amount": i.amount, "paid": i.paid_share} for i in new]}


def exchange(db: Session, order: Order, user: User, returns: list[dict], items: list[dict], condition: str,
             method: str | None = None, new_amount: int | None = None, reason: str = "",
             request_id: str | None = None) -> Exchange:
    """售后换货（拿 A 换 B，可跨商品、可部分、可一换多）：多退少补，旧商品回库存或进残次品库，新商品出库。

    原商品行不改不删：退回的件数记一笔“换货”退货（Refund.kind=exchange），换出的商品在订单里另起行
    （记 added_at、exchange_id），报表按换货当天统计，历史日期的销量、实收、毛利不变。
    """
    if not request_id:
        raise HTTPException(400, "缺少请求号，请刷新页面后重试")
    exist = db.scalar(select(Exchange).where(Exchange.request_id == request_id))
    if exist:
        same_request(exist.order_id == order.id and exist.created_by == user.id)
        return exist
    if condition not in ("good", "defective"):
        raise HTTPException(400, "请选择退回商品的状态：完好可再售，或拆封 / 破损")
    _check_refund_days(db, order, user, "换货")
    back, new, old_amount, new_original, amount, diff = _exchange_calc(db, order, user, returns, items, new_amount)
    if diff < 0 and not has_perm(user, "refund"):
        raise HTTPException(403, "需要退差价，你没有退款权限")
    if diff and method is None:
        pays = [p for p in order.payments if p.kind == "pay"]
        method = pays[0].method if pays else "cash"  # 退差价默认退回原支付方式
    if diff and method not in PAY_METHODS:
        raise HTTPException(400, "收款方式错误")
    if diff < 0 and -diff > old_amount:  # 不会发生（新商品金额不为负），留作兜底
        raise HTTPException(400, "退差价不能超过退回商品的实收")
    rf = Refund(no=_no("T"), order_id=order.id, amount=max(0, -diff), restock=condition == "good", kind="exchange",
                created_by=user.id)
    db.add(rf)
    db.flush()
    ex = Exchange(no=_no("H"), order_id=order.id, refund_id=rf.id, old_amount=old_amount, new_original=new_original,
                  new_amount=amount, diff=diff, method=method if diff else None, condition=condition,
                  reason=(reason or "").strip()[:200], created_by=user.id, request_id=request_id)
    db.add(ex)
    db.flush()
    for it, q, a in back:
        db.add(RefundLine(refund_id=rf.id, order_item_id=it.id, qty=q, amount=a))
        it.refunded_qty += q
    # 库存：先按（库存品、地点）排序把要动的行都锁上，防死锁
    store_loc = order.store.location_id
    bad_loc = defective_location(db, db.get(Location, store_loc)).id if condition == "defective" else None
    old_need: dict[int, Decimal] = defaultdict(Decimal)
    for it, q, _ in back:
        if it.stock_item_id:
            old_need[it.stock_item_id] += Decimal(it.deduct_qty) * q
    new_need: dict[int, Decimal] = defaultdict(Decimal)
    for i in new:
        if i.stock_item_id:
            new_need[i.stock_item_id] += Decimal(i.deduct_qty) * i.qty
    pairs = [(sid, store_loc) for sid in new_need]
    if order.stock_deducted:
        pairs += [(sid, bad_loc or store_loc) for sid in old_need]
    lock_balances(db, pairs)
    if order.stock_deducted:
        for sid, q in sorted(old_need.items()):
            alloc = return_alloc(db, order.id, store_loc, sid, q)  # 尽量回到当初卖出的批次
            if bad_loc:  # 拆封 / 破损：进残次品库（批次信息照搬），不回可售库存
                alloc = [(find_batch(db, bad_loc, sid, b.batch_no, b.production_date, b.expiry_date, create=True), bq)
                         for b, bq in alloc]
            change_stock(db, location_id=bad_loc or store_loc, stock_item_id=sid, qty=q, kind="exchange_in",
                         order_id=order.id, user_id=user.id, alloc=alloc)
    rules = get_setting(db, "rules")
    allow = rules["online_allow_negative"] if order.source == "online" else rules["pos_allow_negative"]
    for sid, q in sorted(new_need.items()):
        change_stock(db, location_id=store_loc, stock_item_id=sid, qty=-q, kind="exchange_out", order_id=order.id,
                     allow_negative=allow, user_id=user.id)
    at = now()
    for i in new:
        i.order_id, i.added_at, i.exchange_id = order.id, at, ex.id
        db.add(i)
    if diff > 0:
        db.add(Payment(order_id=order.id, kind="pay", method=method, amount=diff, received=diff, created_by=user.id,
                       exchange_id=ex.id))
        order.paid_amount += diff
    elif diff < 0:
        db.add(Payment(order_id=order.id, kind="refund", method=method, amount=-diff, received=-diff,
                       created_by=user.id, refund_id=rf.id, exchange_id=ex.id))
        order.refunded_amount += -diff
    name = lambda n, k: n + ("·" + k if k and k != "默认" else "")
    detail = ("退回 " + "、".join(f"{name(it.product_name, it.sku_name)}×{q}" for it, q, _ in back)
              + ("（完好，回可售库存）" if condition == "good" else "（拆封 / 破损，进残次品库）")
              + "；换出 " + "、".join(f"{name(i.product_name, i.sku_name)}×{i.qty}" for i in new)
              + (f"；补收 {diff / 100:.2f} 元（{PAY_METHODS[method]}）" if diff > 0 else "")
              + (f"；退还 {-diff / 100:.2f} 元（{PAY_METHODS[method]}）" if diff < 0 else "")
              + ("；差价为 0" if diff == 0 else "") + (f"；原因：{ex.reason}" if ex.reason else ""))
    rf.reason = ("换货 " + ex.no + "：" + detail)[:200]
    log(db, order, "换货", f"{ex.no} {detail}", user)
    from .. import audit
    audit.record(db, user, "换货", order.no, summary=f"{ex.no} {detail}")
    from .printq import enqueue
    enqueue(db, order.store, order, "exchange", user, exchange=ex)
    db.flush()
    db.expire(order, ["items", "payments"])
    return ex


def refund(db: Session, order: Order, user: User, lines: list[dict], restock: bool = True,
           method: str | None = None, reason: str = "", amount: int | None = None,
           request_id: str | None = None) -> Refund:
    """退货退款。lines=[{order_item_id, qty}]；金额按实收分摊自动计算，传 amount 只用于核对。"""
    exist = _by_request(db, Refund, request_id)
    if exist:
        same_request(exist.order_id == order.id and exist.created_by == user.id
                     and _qty_map((l.order_item_id, l.qty) for l in exist.lines)
                     == _qty_map((ln["order_item_id"], ln["qty"]) for ln in lines))
        return exist
    if order.pay_status not in ("paid", "partial_refunded"):
        raise HTTPException(409, "订单未收款或已全额退款，不能退款")
    _check_refund_days(db, order, user, "退款")
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
    # 退款金额必须等于本次退货商品的实收金额：否则会出现“件数退完、钱没退完”却被标成已全额退款
    if amount is not None and amount != calc_total:
        raise HTTPException(400, f"退款金额须等于本次退货金额 {calc_total / 100:.2f} 元")
    amount = calc_total
    if amount > order.paid_amount - order.refunded_amount:
        raise HTTPException(400, "退款金额超过了本单剩余可退金额")
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
    from .. import audit
    audit.record(db, user, "退款", order.no, summary=f"{order.store.name if order.store else ''} 退 {amount / 100:.2f} 元（{PAY_METHODS.get(method, method)}）："
                 + "、".join(f"{it.product_name}{'·' + it.sku_name if it.sku_name and it.sku_name != '默认' else ''}×{q}" for it, q, _ in rlines)
                 + ("，商品回库存" if restock else "，商品不回库存") + (f"；原因：{reason}" if reason else ""))
    db.flush()
    db.refresh(rf)
    return rf
