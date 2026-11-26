"""门店收银的在线收款：扫顾客付款码 / 出收款码。

先只建交易、不建订单；支付平台确认付款后（同步结果、回调或查单，谁先到算谁）才开单、扣库存、记收款，
这样顾客没付成功不会留下半截订单，也不会先扣了库存。
"""
import logging

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...models import Order, Payment, PayTxn, Store, User
from .. import orders as svc
from . import PROVIDERS, service

log = logging.getLogger("shouyin")


def quote_amount(db: Session, user: User, lines: list[dict], discount_rate, payable) -> int:
    o = Order()
    o.items = svc.build_items(db, lines, online=False)
    svc.apply_pricing(o, user, discount_rate, payable)
    return o.payable_amount


def start(db: Session, user: User, store: Store, lines: list[dict], discount_rate, payable, remark: str,
          request_id: str | None, auth_code: str = "", provider: str = "", notify_url: str = "",
          client_ip: str = "") -> tuple[PayTxn, str]:
    """发起收银在线收款。返回（交易，二维码内容；扫付款码时为空）。同一请求号重发返回原交易。"""
    if request_id:
        old = db.scalar(select(PayTxn).where(PayTxn.request_id == request_id))
        if old:
            svc.same_request(old.created_by == user.id and (old.context or {}).get("store_id") == store.id)
            return old, (old.context or {}).get("code_url", "")
    amount = quote_amount(db, user, lines, discount_rate, payable)
    db.rollback()  # 试算用的临时订单不留
    ctx = {"kind": "pos", "store_id": store.id, "user_id": user.id, "lines": lines, "discount_rate": discount_rate,
           "payable": payable, "remark": remark}
    subject = f"{store.name}购物"
    if auth_code:
        txn = service.micropay(db, None, amount, auth_code, subject, user, client_ip,
                               request_id=request_id, context=ctx)
        return txn, ""
    if provider not in PROVIDERS:
        raise HTTPException(400, "请选择微信或支付宝")
    txn, code_url = service.precreate(db, provider, None, amount, subject, notify_url, user,
                                      request_id=request_id, context=ctx)
    txn.context = {**ctx, "code_url": code_url}
    db.commit()
    return txn, code_url


def on_paid(db: Session, txn: PayTxn):
    """付款成功：按发起时的内容开单。开单失败（例如商品刚被停用）钱已经收了，不能丢，记下来让人处理。"""
    ctx = txn.context or {}
    if ctx.get("kind") != "pos" or txn.order_id:
        return
    user, store = db.get(User, ctx["user_id"]), db.get(Store, ctx["store_id"])
    try:
        with db.begin_nested():
            o = svc.pos_checkout(db, user, store, ctx["lines"], [{"method": txn.provider, "amount": txn.amount}],
                                 ctx.get("discount_rate"), ctx.get("payable"), ctx.get("remark", ""),
                                 request_id="PAY" + txn.out_no)
            for p in o.payments:
                if p.kind == "pay":
                    p.pay_txn_id = txn.id
            txn.order_id = o.id
    except HTTPException as e:
        txn.message = f"已收款但开单失败：{e.detail}。请原路退款或联系管理员补单"
        log.error("在线收款 %s 开单失败：%s", txn.out_no, e.detail)


service.PAID_HOOKS.append(on_paid)
