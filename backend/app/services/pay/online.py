"""扫码点单在线付款（2026-11-26 Aether 定：必须在线付款）。

- 下单后订单是“待付款”，门店看不到；15 分钟内付成功才交给门店（自动接单、出票），超时自动取消回补库存。
- 微信里打开用微信支付 JSAPI（要服务号网页授权拿 openid），其它浏览器（含支付宝）用支付宝手机网站支付。
- 两家都没开通时，扫码点单照旧（下单即交给门店，到店 / 送达时收款）。
- 取消之后才到账的钱（顾客在超时边缘付款），自动原路全额退回。
"""
import logging
import os

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...db import now
from ...models import Customer, Order, Payment, PayTxn
from .. import orders as svc
from . import PAID, PROVIDERS, PayError, gateway, mode, service

log = logging.getLogger("shouyin")


def wx_oauth_ready() -> bool:
    return bool(os.environ.get("WXMP_APPID") and os.environ.get("WXMP_SECRET"))


def h5_providers() -> list[str]:
    """扫码点单能用的付款方式。微信要同时有 JSAPI 和服务号网页授权（模拟通道不用授权）。"""
    out = []
    gw = gateway("wechat")
    if gw and "jsapi" in gw.scenes and (wx_oauth_ready() or mode("wechat") == "mock"):
        out.append("wechat")
    gw = gateway("alipay")
    if gw and "wap" in gw.scenes:
        out.append("alipay")
    return out


def _close_pending(db: Session, order: Order) -> bool:
    """关掉这单还在等的交易。关之前会查单：已经付了返回 True。"""
    for t in db.scalars(select(PayTxn).where(PayTxn.order_id == order.id, PayTxn.status == "pending")):
        try:
            service.close(db, t)
        except HTTPException:
            pass  # 关不掉（网络）也不要紧：之后再付进来会自动退款
        if order.pay_status == "paid":
            return True
    return order.pay_status == "paid"


def start(db: Session, order: Order, customer: Customer, provider: str, notify_base: str, return_url: str) -> dict:
    if order.status != "awaiting_pay":
        raise HTTPException(409, "订单已付款或已取消" if order.status != "cancelled" else "订单已取消，请重新下单")
    if order.pay_deadline and now() > order.pay_deadline:
        raise HTTPException(409, "已超过付款时间，请重新下单")
    if provider not in h5_providers():
        raise HTTPException(400, f"{PROVIDERS.get(provider, provider)}暂不能用")
    if _close_pending(db, order):  # 换方式 / 重新付款：旧的交易先关掉，已经付了就不用再付
        db.commit()
        return {"paid": True}
    db.commit()
    scene = "jsapi" if provider == "wechat" else "wap"
    subject = f"{order.store.name}订单{order.no}"
    txn = service._new_txn(db, provider, scene, order, order.payable_amount, subject, None,
                           context={"kind": "online", "customer_id": customer.id})
    notify = f"{notify_base}/api/pay/notify/{provider}"
    gw = gateway(provider)
    try:
        if provider == "wechat":
            params = gw.jsapi(txn.out_no, txn.amount, subject, customer.openid, notify)
            out = {"provider": provider, "jsapi": params}
        else:
            out = {"provider": provider, "url": gw.wap(txn.out_no, txn.amount, subject, notify, return_url)}
    except PayError as e:
        txn.status, txn.message = "failed", str(e)[:200]
        db.commit()
        raise HTTPException(502, f"发起付款失败：{e}") from e
    if mode(provider) == "mock":
        out["mock"] = True
    return {"paid": False, "out_no": txn.out_no, **out}


def check(db: Session, order: Order) -> Order:
    """顾客付完回来时查一次（不等通知）。"""
    for t in db.scalars(select(PayTxn).where(PayTxn.order_id == order.id, PayTxn.status == "pending")):
        service.refresh(db, t)
    return order


def on_paid(db: Session, txn: PayTxn):
    ctx = txn.context or {}
    if ctx.get("kind") != "online" or not txn.order_id:
        return
    order = svc.get_order(db, txn.order_id, lock=True)
    if order.status != "awaiting_pay" or order.pay_status != "unpaid":
        # 单子已取消（超时）或已经用别的交易付过：这笔钱原路退回
        try:
            rt = service.refund(db, txn, txn.amount, "订单已取消或重复付款，自动退款", None, inline=True)
            txn.message = "订单已取消或重复付款，已自动退款" if rt.status == "success" else "订单已取消或重复付款，退款处理中"
        except HTTPException as e:
            txn.message = f"订单已取消或重复付款，自动退款失败：{e.detail}。请到商户平台手工退款"
            log.error("在线付款 %s 自动退款失败：%s", txn.out_no, e.detail)
        svc.log(db, order, "退款", txn.message)
        return
    db.add(Payment(order_id=order.id, kind="pay", method=txn.provider, amount=txn.amount, received=txn.amount,
                   pay_txn_id=txn.id))
    order.paid_amount, order.pay_status, order.paid_at = txn.amount, "paid", now()
    order.pay_deadline = None
    svc.log(db, order, "收款", f"{PROVIDERS[txn.provider]}在线付款 {txn.amount / 100:.2f}")
    svc.release_online(db, order)


def expire(db: Session, limit: int = 50) -> int:
    """取消超过付款时间的待付款订单，回补库存。取消前先查单，付了的照常交给门店。"""
    n = 0
    ids = db.scalars(select(Order.id).where(Order.status == "awaiting_pay", Order.pay_deadline < now())
                     .order_by(Order.id).limit(limit)).all()
    db.rollback()
    for oid in ids:
        o = svc.get_order(db, oid, lock=True)  # 多个进程同时跑也只取消一次
        if o.status == "awaiting_pay" and not _close_pending(db, o) and o.status == "awaiting_pay":
            svc.cancel(db, o, None, "超时未付款")
            n += 1
        db.commit()
    return n


service.PAID_HOOKS.append(on_paid)
