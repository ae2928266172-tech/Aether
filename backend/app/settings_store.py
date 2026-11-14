"""业务规则和小票模板的默认值。存于 settings 表，后台可修改。

带“待确认”的规则是向 Aether 确认中的默认建议，改这里或后台设置即可，不需要改代码。
"""
import copy

from sqlalchemy.orm import Session

from .models import Setting

DEFAULTS: dict[str, dict] = {
    "rules": {
        # 待确认：小程序订单在下单时扣库存（create），或接单时扣（accept）
        "online_deduct_on": "create",
        # 待确认：门店收银库存不足时是否允许卖成负数
        "pos_allow_negative": True,
        # 待确认：小程序订单库存不足时是否允许下单
        "online_allow_negative": False,
        # 小程序下单是否必须填写位置（床号、桌号等）
        "online_location_required": True,
        "location_label": "床号",
        "area_label": "病区",
    },
    "receipt": {
        "paper_width": 58,
        "title": "购物小票",
        "header": "",
        "footer": "谢谢惠顾",
        "footer_image": "",  # 底部图片，如微信二维码
        "show_store": True,
        "show_order_no": True,
        "show_time": True,
        "show_area": True,
        "show_cashier": True,
        "show_sku": True,
        "show_unit_price": True,
        "show_discount": True,
        "show_payment": True,
        "show_remark": True,
        "show_medical": False,
        "medical_fields": ["reg_cert_no", "production_license_no", "registrant", "production_address"],
        "copies": 1,
    },
}


def get_setting(db: Session, key: str) -> dict:
    base = copy.deepcopy(DEFAULTS.get(key, {}))
    row = db.get(Setting, key)
    if row:
        base.update(row.value or {})
    return base


def set_setting(db: Session, key: str, value: dict) -> dict:
    merged = get_setting(db, key)
    allowed = DEFAULTS.get(key)
    for k, v in value.items():
        if allowed is not None and k not in allowed:
            continue
        merged[k] = v
    row = db.get(Setting, key)
    if row:
        row.value = merged
    else:
        db.add(Setting(key=key, value=merged))
    db.flush()
    return merged
