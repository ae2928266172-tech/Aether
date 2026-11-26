"""在线收款：支付平台回调、通道状态。收银 / 扫码点单的收款入口在各自的接口里。"""
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import User
from ..security import current_user
from ..services import pay
from ..services.pay import service

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
