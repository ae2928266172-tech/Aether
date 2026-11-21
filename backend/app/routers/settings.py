"""后台设置：小票模板、业务规则。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Order, OrderItem, Store, User
from ..security import current_user, require
from ..services.receipt import build_receipt
from ..settings_store import get_setting, set_setting

router = APIRouter(prefix="/api/settings", tags=["设置"])


def _check_style(body: dict):
    for k, v in body.items():
        if k.endswith("_size") and v not in ("s", "m", "l"):
            raise HTTPException(400, "字号只能是 正常 / 加高 / 加大")
        if k.endswith("_align") and v not in ("left", "center", "right"):
            raise HTTPException(400, "对齐方式错误")
    if "line_spacing" in body and body["line_spacing"] not in ("compact", "normal", "loose"):
        raise HTTPException(400, "行距错误")
    if "separator" in body and body["separator"] not in ("-", "=", "*", ".", "_", " "):
        raise HTTPException(400, "分隔线样式错误")
    if "image_width" in body and not (20 <= int(body["image_width"]) <= 100):
        raise HTTPException(400, "图片宽度为纸宽的 20% 到 100%")
    for k in ("top_blank", "bottom_blank"):
        if k in body and not (0 <= int(body[k]) <= 10):
            raise HTTPException(400, "留白行数为 0 到 10")


@router.get("/receipt")
def get_receipt(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return get_setting(db, "receipt")


@router.put("/receipt")
def put_receipt(body: dict, db: Session = Depends(get_db), _: User = Depends(require("receipt_config"))):
    if "paper_width" in body and int(body["paper_width"]) not in (58, 80):
        raise HTTPException(400, "纸宽只能是 58 或 80")
    if "copies" in body and not (1 <= int(body["copies"]) <= 3):
        raise HTTPException(400, "打印份数为 1 到 3")
    _check_style(body)
    v = set_setting(db, "receipt", body)
    db.commit()
    return v


@router.post("/receipt/preview")
def preview(body: dict, db: Session = Depends(get_db), user: User = Depends(require("receipt_config"))):
    """用示例订单预览小票（不保存设置、不写数据库）。"""
    _check_style(body)
    set_setting(db, "receipt", body)
    store = Store(name="示例门店")
    o = Order(no="S202611140001", source="online", store=store, area_name="一病区", location_note="12 床",
              status="completed", pay_status="paid", original_amount=3000, payable_amount=2850, discount_rate=95,
              paid_amount=2850, refunded_amount=0, remark="", print_count=0)
    from ..db import now
    o.created_at = now()
    o.items = [OrderItem(product_name="一次性护理垫", sku_name="大号", unit="包", qty=2, unit_price=1000, amount=2000,
                         paid_share=1900, refunded_qty=0,
                         medical_info={"reg_cert_no": "苏械注准20230000000", "production_license_no": "苏食药监械生产许00000000号",
                                       "registrant": "示例医疗用品有限公司", "production_address": "江苏省南京市示例路 1 号"}),
               OrderItem(product_name="纸杯", sku_name="默认", unit="个", qty=10, unit_price=100, amount=1000,
                         paid_share=950, refunded_qty=0, medical_info={})]
    from ..models import Payment
    o.payments = [Payment(kind="pay", method="cash", amount=2850, received=3000, change=150)]
    r = build_receipt(db, o, user)
    db.rollback()
    return r


@router.get("/rules")
def get_rules(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return get_setting(db, "rules")


@router.put("/rules")
def put_rules(body: dict, db: Session = Depends(get_db), user: User = Depends(require("stores"))):
    if "online_deduct_on" in body and body["online_deduct_on"] not in ("create", "accept"):
        raise HTTPException(400, "扣库存时机只能是下单时或接单时")
    if "expiry_alert_days" in body:
        try:
            body["expiry_alert_days"] = int(body["expiry_alert_days"])
        except (TypeError, ValueError):
            raise HTTPException(400, "临期提醒天数请填整数")
        if not 0 <= body["expiry_alert_days"] <= 3650:
            raise HTTPException(400, "临期提醒天数要在 0 到 3650 之间")
    if "refund_days" in body:
        try:
            body["refund_days"] = int(body["refund_days"])
        except (TypeError, ValueError):
            raise HTTPException(400, "退款期限天数请填整数")
        if not 0 <= body["refund_days"] <= 3650:
            raise HTTPException(400, "退款期限天数要在 0 到 3650 之间（0 表示不限）")
    if "public_url" in body:
        body["public_url"] = str(body["public_url"] or "").strip().rstrip("/")
        if body["public_url"] and not body["public_url"].startswith(("http://", "https://")):
            raise HTTPException(400, "顾客访问网址要以 http:// 或 https:// 开头")
    from .. import audit
    before = dict(get_setting(db, "rules"))
    v = set_setting(db, "rules", body)
    audit.record(db, user, "业务规则", "业务规则", before, dict(v))
    db.commit()
    return v
