"""打印小助手接口：接小票机的电脑（可以是只有 IE 的 Win7）用门店打印密钥取票、回报完成。

取票返回原始 ESC/POS 字节；没有任务时返回 204。小助手是 PowerShell 2.0 脚本，所以接口尽量简单：
- GET  /api/print-agent/next?key=...   → 200 字节流（响应头 X-Job-Id、X-Job-Kind、X-Beep），或 204
- POST /api/print-agent/done/{id}?key=... → 标记已打印
"""
import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db, now
from ..models import Order, PrintJob, Store, User
from ..security import require
from ..services import escpos
from ..services.orders import log
from ..services.receipt import build_receipt
from ..settings_store import get_setting

router = APIRouter(prefix="/api", tags=["打印小助手"])
RESEND_AFTER = timedelta(seconds=90)  # 发出后这么久没回报完成，就认为小助手中途断了，重新发


def _store_by_key(db: Session, key: str) -> Store:
    store = db.scalar(select(Store).where(Store.print_key == key)) if key else None
    if not store:
        raise HTTPException(401, "打印密钥无效，请在后台“门店与区域”里重新复制")
    return store


@router.get("/print-agent/next")
def next_job(key: str, db: Session = Depends(get_db)):
    store = _store_by_key(db, key)
    store.agent_seen_at = now()
    job = db.scalar(select(PrintJob).where(PrintJob.store_id == store.id, PrintJob.status == "pending")
                    .order_by(PrintJob.id).with_for_update())
    if not job:
        job = db.scalar(select(PrintJob).where(PrintJob.store_id == store.id, PrintJob.status == "sent",
                                               PrintJob.sent_at < now() - RESEND_AFTER).order_by(PrintJob.id))
    if not job:
        db.commit()
        return Response(status_code=204)
    if job.order_id:
        o = db.get(Order, job.order_id)
        o.print_count += 1
        uid = job.created_by or o.accepted_by or o.created_by
        who = db.get(User, uid) if uid else None
        reprint = job.kind == "reprint" or o.print_count > 1
        log(db, o, "补打小票" if reprint else "打印小票", "打印小助手", who)
        data = escpos.build(build_receipt(db, o, who, reprint=reprint))
    else:
        data = escpos.test_page(store.name, int(get_setting(db, "receipt").get("paper_width", 58)))
    job.status, job.sent_at = "sent", now()
    db.commit()
    return Response(content=data, media_type="application/octet-stream",
                    headers={"X-Job-Id": str(job.id), "X-Job-Kind": job.kind,
                             "X-Beep": "1" if job.kind == "new_order" else "0"})


@router.post("/print-agent/done/{job_id}")
def job_done(job_id: int, key: str, db: Session = Depends(get_db)):
    store = _store_by_key(db, key)
    job = db.get(PrintJob, job_id)
    if not job or job.store_id != store.id:
        raise HTTPException(404, "任务不存在")
    job.status, job.done_at = "done", now()
    db.commit()
    return {"ok": True}


@router.get("/print-agent/download")
def download_agent():
    """打包下载打印小助手（安装脚本），接小票机的电脑用 IE 打开这个地址即可下载。"""
    import io
    import os
    import zipfile
    src = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "tools", "print-agent")
    if not os.path.isdir(src):
        raise HTTPException(404, "服务器上没有打印小助手文件")
    class GbkInfo(zipfile.ZipInfo):
        # 中文文件名按 GBK 写入（不打 UTF-8 标记），Win7 自带的解压才能正确显示
        def _encodeFilenameFlags(self):
            return self.filename.encode("gbk"), self.flag_bits & ~0x800

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name in os.listdir(src):
            info = GbkInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            with open(os.path.join(src, name), "rb") as f:
                z.writestr(info, f.read())
    return Response(content=buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": "attachment; filename=print-agent.zip"})


# ---------------- 后台：密钥、测试页、队列状态 ----------------

def _status(db: Session, store: Store) -> dict:
    pending = db.scalar(select(PrintJob.id).where(PrintJob.store_id == store.id, PrintJob.status != "done").limit(1))
    online = bool(store.agent_seen_at and store.agent_seen_at > now() - timedelta(seconds=30))
    return {"print_mode": store.print_mode, "has_key": bool(store.print_key), "agent_online": online,
            "agent_seen_at": store.agent_seen_at.strftime("%Y-%m-%d %H:%M:%S") if store.agent_seen_at else None,
            "has_pending": pending is not None}


@router.get("/stores/{sid}/printer")
def printer_status(sid: int, db: Session = Depends(get_db), _: User = Depends(require("stores"))):
    store = db.get(Store, sid)
    if not store:
        raise HTTPException(404, "门店不存在")
    return {**_status(db, store), "print_key": store.print_key}


@router.post("/stores/{sid}/printer/key")
def reset_key(sid: int, db: Session = Depends(get_db), _: User = Depends(require("stores"))):
    """生成新的打印密钥；旧密钥立即失效。"""
    store = db.get(Store, sid)
    if not store:
        raise HTTPException(404, "门店不存在")
    store.print_key = secrets.token_hex(12)
    db.commit()
    return {**_status(db, store), "print_key": store.print_key}


@router.post("/stores/{sid}/printer/test")
def test_print(sid: int, db: Session = Depends(get_db), user: User = Depends(require("stores"))):
    store = db.get(Store, sid)
    if not store:
        raise HTTPException(404, "门店不存在")
    if store.print_mode != "agent":
        raise HTTPException(400, "这家门店的出票方式不是“打印小助手”")
    db.add(PrintJob(store_id=store.id, order_id=None, kind="test", created_by=user.id))
    db.commit()
    return _status(db, store)
