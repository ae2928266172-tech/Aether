"""在线收款的交易记账：建交易、调通道、按结果改状态、回调、原路退款。

规则：
- 钱以支付平台为准。只有通道返回“已付”（付款码同步结果、验签通过的通知、主动查单）才把交易改成 paid，
  并核对金额；金额不符不算付款，记下原因等人工处理。
- 改成 paid 只发生一次，之后再来的通知 / 查单结果直接忽略（支付平台会重复通知）。
- 调支付平台前先提交交易记录，服务器中途断掉也能凭商户单号查回来。
- 交易付成功后依次调用 PAID_HOOKS，由收银 / 扫码点单各自把订单记成已收款。
"""
import logging
import secrets
from collections.abc import Callable

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ...db import now
from ...models import Order, PayRefundTxn, PayTxn, User
from . import CLOSED, FAILED, PAID, PAYING, PROVIDERS, PayError, TradeResult, detect_provider, gateway

log = logging.getLogger("shouyin")
PAID_HOOKS: list[Callable[[Session, PayTxn], None]] = []
STATUS_TEXT = {"pending": "等待付款", PAID: "已付款", FAILED: "付款失败", CLOSED: "已关闭"}


def new_no(prefix: str) -> str:
    """商户单号：前缀 + 年月日时分秒 + 6 位随机，共 21 位，两家都接受。"""
    return f"{prefix}{now():%Y%m%d%H%M%S}{secrets.token_hex(3).upper()}"


def _gw(provider: str, scene: str):
    gw = gateway(provider)
    if gw is None:
        raise HTTPException(400, f"{PROVIDERS.get(provider, provider)}尚未开通")
    if scene not in gw.scenes:
        raise HTTPException(400, f"{PROVIDERS[provider]}不支持这种收款方式")
    return gw


def _new_txn(db: Session, provider: str, scene: str, order: Order | None, amount: int, subject: str,
             user: User | None) -> PayTxn:
    if amount <= 0:
        raise HTTPException(400, "收款金额必须大于 0")
    txn = PayTxn(out_no=new_no("P"), provider=provider, scene=scene, order_id=order.id if order else None,
                 amount=amount, subject=subject[:100], status="pending", created_by=user.id if user else None)
    db.add(txn)
    db.commit()  # 先落库再调支付平台
    return txn


def apply_result(db: Session, txn: PayTxn, r: TradeResult) -> PayTxn:
    """按通道返回结果改交易状态。已付的交易不再变。"""
    if txn.status == PAID:
        return txn
    if r.status == PAID:
        if r.amount is not None and r.amount != txn.amount:
            txn.status, txn.message = FAILED, f"金额不符：平台 {r.amount} 分，应收 {txn.amount} 分，请人工核对"
            log.error("收款金额不符 %s %s", txn.out_no, txn.message)
            return txn
        txn.status, txn.paid_at = PAID, now()
        txn.trade_no, txn.payer, txn.message = r.trade_no or txn.trade_no, r.payer or txn.payer, ""
        db.flush()
        for hook in PAID_HOOKS:
            hook(db, txn)
    elif r.status in (FAILED, CLOSED):
        txn.status, txn.message = r.status, (r.message or "")[:200]
    else:
        txn.message = (r.message or "")[:200]
    return txn


def micropay(db: Session, order: Order | None, amount: int, auth_code: str, subject: str, user: User | None,
             client_ip: str = "") -> PayTxn:
    """扫顾客付款码。返回的交易可能是 pending（顾客在输密码），要接着 refresh。"""
    auth_code = (auth_code or "").strip()
    provider = detect_provider(auth_code)
    if not provider:
        raise HTTPException(400, "无法识别的付款码，请让顾客刷新后重扫")
    gw = _gw(provider, "micropay")
    txn = _new_txn(db, provider, "micropay", order, amount, subject, user)
    try:
        r = gw.micropay(txn.out_no, amount, auth_code, subject, client_ip)
    except PayError as e:
        # 请求发出去了但结果不明，留在 pending 由查单决定
        txn.message = str(e)[:200]
        db.commit()
        return txn
    apply_result(db, txn, r)
    db.commit()
    return txn


def precreate(db: Session, provider: str, order: Order | None, amount: int, subject: str, notify_url: str,
              user: User | None) -> tuple[PayTxn, str]:
    """出收款码，返回（交易，二维码内容）。"""
    gw = _gw(provider, "native")
    txn = _new_txn(db, provider, "native", order, amount, subject, user)
    try:
        code_url = gw.precreate(txn.out_no, amount, subject, notify_url)
    except PayError as e:
        txn.status, txn.message = FAILED, str(e)[:200]
        db.commit()
        raise HTTPException(502, str(e)) from e
    return txn, code_url


def refresh(db: Session, txn: PayTxn) -> PayTxn:
    """主动查单。"""
    if txn.status != "pending":
        return txn
    try:
        r = gateway(txn.provider).query(txn.out_no)
    except (PayError, AttributeError) as e:
        txn.message = str(e)[:200]
        return txn
    return apply_result(db, txn, r)


def close(db: Session, txn: PayTxn) -> PayTxn:
    """不收了：关单 / 撤销。关之前先查一次，已经付了就不关。"""
    refresh(db, txn)
    if txn.status != "pending":
        return txn
    try:
        gateway(txn.provider).close(txn.out_no)
    except PayError as e:
        refresh(db, txn)
        if txn.status == "pending":
            raise HTTPException(502, f"关闭交易失败：{e}") from e
        return txn
    txn.status, txn.message = CLOSED, "已关闭"
    return txn


def handle_notify(db: Session, provider: str, headers: dict, body: bytes) -> PayTxn | None:
    gw = gateway(provider)
    if gw is None:
        raise PayError("通道未开通")
    r = gw.parse_notify(headers, body)
    txn = db.scalar(select(PayTxn).where(PayTxn.out_no == r.out_no, PayTxn.provider == provider).with_for_update())
    if txn is None:
        log.error("收到未知交易的付款通知 %s %s", provider, r.out_no)
        return None
    apply_result(db, txn, r)
    return txn


def refundable(db: Session, txn: PayTxn) -> int:
    """还能退多少：已付金额减去已退和退款中的。"""
    used = db.scalar(select(func.coalesce(func.sum(PayRefundTxn.amount), 0))
                     .where(PayRefundTxn.txn_id == txn.id, PayRefundTxn.status.in_(("processing", "success"))))
    return txn.amount - int(used or 0) if txn.status == PAID else 0


def refund(db: Session, txn: PayTxn, amount: int, reason: str, user: User | None,
           refund_id: int | None = None) -> PayRefundTxn:
    """原路退款。失败抛错，交给上层决定（例如改成现金退）。"""
    if amount <= 0:
        raise HTTPException(400, "退款金额必须大于 0")
    if amount > refundable(db, txn):
        raise HTTPException(400, f"原路最多还能退 {refundable(db, txn) / 100:.2f} 元")
    gw = gateway(txn.provider)
    if gw is None:
        raise HTTPException(400, f"{PROVIDERS[txn.provider]}尚未开通，无法原路退款")
    rt = PayRefundTxn(out_refund_no=new_no("R"), txn_id=txn.id, refund_id=refund_id, amount=amount,
                      created_by=user.id if user else None)
    db.add(rt)
    db.commit()
    try:
        r = gw.refund(txn.out_no, rt.out_refund_no, amount, txn.amount, reason or "退货退款")
    except PayError as e:
        # 不知道退没退成，保持“退款中”，之后用同一个退款单号重发是安全的
        rt.message = str(e)[:200]
        db.commit()
        return rt
    rt.status, rt.refund_no, rt.message = r.status, r.refund_no, r.message[:200]
    if r.status == "success":
        rt.finished_at = now()
        txn.refunded = (txn.refunded or 0) + amount
    elif r.status == "failed":
        rt.finished_at = now()
    db.commit()
    return rt


def txn_out(t: PayTxn) -> dict:
    return {"id": t.id, "out_no": t.out_no, "provider": t.provider, "provider_text": PROVIDERS[t.provider],
            "scene": t.scene, "order_id": t.order_id, "amount": t.amount, "status": t.status,
            "status_text": STATUS_TEXT.get(t.status, t.status), "message": t.message, "trade_no": t.trade_no,
            "refunded": t.refunded, "paid_at": t.paid_at.isoformat() if t.paid_at else None}
