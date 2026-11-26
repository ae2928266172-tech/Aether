"""在线收款：支付平台回调、通道状态。收银 / 扫码点单的收款入口在各自的接口里。"""
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Order, PayTxn, Store, User
from ..security import check_store_access, current_user, require
from ..serialize import order_out
from ..services import pay
from ..services.pay import online, pos, service  # noqa: F401  online、pos 注册付款成功后的处理
from ..settings_store import get_setting

router = APIRouter(prefix="/api/pay", tags=["在线收款"])


@router.post("/notify/{provider}")
async def notify(provider: str, request: Request, db: Session = Depends(get_db)):
    """微信支付 / 支付宝付款结果通知。验签不过回 400，支付平台会过一会儿重发。"""
    if provider not in pay.PROVIDERS:
        raise HTTPException(404)
    body = await request.body()
    try:
        service.handle_notify(db, provider, dict(request.headers), body)
    except pay.PayError as e:
        db.rollback()
        return JSONResponse(status_code=400, content={"code": "FAIL", "message": str(e)})
    db.commit()
    text, ctype = pay.gateway(provider).notify_ok
    return Response(content=text, media_type=ctype)


@router.get("/channels")
def channels(_: User = Depends(current_user)):
    """各通道是否可用、支持哪些收款方式。mode：off 未开通 / mock 模拟 / sandbox 沙箱 / live 正式。"""
    out = {}
    for p, name in pay.PROVIDERS.items():
        gw = pay.gateway(p)
        out[p] = {"name": name, "mode": pay.mode(p), "scenes": list(gw.scenes) if gw else []}
    return out


# ---------------- 门店收银 ----------------

class LineIn(BaseModel):
    sku_id: int
    qty: int


class PosStartIn(BaseModel):
    store_id: int
    lines: list[LineIn]
    discount_rate: int | None = None
    payable: int | None = None
    remark: str = Field("", max_length=200)
    auth_code: str = ""  # 扫到的顾客付款码；为空时出收款码
    provider: str = ""  # 出收款码时选 wechat / alipay
    request_id: str | None = None


def notify_base(db: Session, request: Request) -> str:
    return (get_setting(db, "rules").get("public_url") or str(request.base_url)).rstrip("/")


def _txn_view(db: Session, t, code_url: str = "") -> dict:
    d = service.txn_out(t)
    d["code_url"] = code_url or (t.context or {}).get("code_url", "")
    d["order"] = order_out(db.get(Order, t.order_id)) if t.order_id else None
    return d


@router.post("/pos/start")
def pos_start(body: PosStartIn, request: Request, db: Session = Depends(get_db), user: User = Depends(require("pos"))):
    """收银在线收款：扫顾客付款码，或出收款码让顾客扫。付款成功才开单。"""
    check_store_access(user, body.store_id)
    store = db.get(Store, body.store_id)
    if not store or not store.active:
        raise HTTPException(400, "门店不存在或已停用")
    provider = body.provider
    base = notify_base(db, request)
    txn, code_url = pos.start(db, user, store, [l.model_dump() for l in body.lines], body.discount_rate, body.payable,
                              body.remark, body.request_id, body.auth_code, provider,
                              f"{base}/api/pay/notify/{provider}" if provider else "",
                              request.client.host if request.client else "")
    db.commit()
    return _txn_view(db, txn, code_url)


def _own_txn(db: Session, tid: int, user: User) -> PayTxn:
    t = db.scalar(select(PayTxn).where(PayTxn.id == tid).with_for_update())
    if not t or (t.context or {}).get("kind") != "pos":
        raise HTTPException(404, "交易不存在")
    check_store_access(user, t.context["store_id"])
    return t


@router.get("/pos/txns/{tid}")
def pos_txn(tid: int, db: Session = Depends(get_db), user: User = Depends(require("pos"))):
    """查收款结果。等待中会顺便向支付平台查一次（顾客输完密码、扫码付完都能马上看到）。"""
    t = _own_txn(db, tid, user)
    service.refresh(db, t)
    db.commit()
    return _txn_view(db, t)


@router.post("/pos/txns/{tid}/close")
def pos_close(tid: int, db: Session = Depends(get_db), user: User = Depends(require("pos"))):
    """不收了：撤销 / 关闭交易。关之前会再查一次，已经付了就返回已付，照常开单。"""
    t = _own_txn(db, tid, user)
    service.close(db, t)
    db.commit()
    return _txn_view(db, t)


@router.post("/mock/{out_no}/pay")
def mock_pay(out_no: str, db: Session = Depends(get_db), _: User = Depends(current_user)):
    """模拟通道下模拟顾客扫码付款（开发 / 测试用，正式环境没有模拟通道）。"""
    t = db.scalar(select(PayTxn).where(PayTxn.out_no == out_no))
    gw = pay.gateway(t.provider) if t else None
    if not t or pay.mode(t.provider) != "mock":
        raise HTTPException(404)
    gw.mock_pay(out_no)
    return {"ok": True}
