"""业务规则和小票模板的默认值。存于 settings 表，后台可修改。

以下默认值已于 2026-11-14 经 Aether 确认：下单就扣库存、库存不够也可以卖（收银和小程序都允许）。
后台“业务规则”可以改，不需要改代码。
"""
import copy

from sqlalchemy.orm import Session

from .models import Setting

DEFAULTS: dict[str, dict] = {
    "rules": {
        # 小程序订单在下单时扣库存（create），或接单时扣（accept）
        "online_deduct_on": "create",
        "online_auto_accept": True,  # 扫码点单下单后自动接单（出小票按门店的自动出票设置）
        # 门店收银库存不足时是否允许卖成负数
        "pos_allow_negative": True,
        # 小程序订单库存不足时是否允许下单
        "online_allow_negative": True,
        # 小程序下单是否必须填写位置（床号、桌号等）
        "online_location_required": True,
        "location_label": "床号",
        "area_label": "病区",
        # 临期提醒：批次有效期在多少天以内（含已过期）时提醒
        "expiry_alert_days": 30,
        # 退款期限：收款后多少天内门店可以退货退款，0 表示不限；管理员不受限（2026-11-21 Aether 定默认 14 天）
        "refund_days": 14,
        # 顾客扫码打开的正式网址（如 https://shop.example.com）。留空时用当前打开后台的地址，
        # 那样在本机或内网地址下生成的二维码，顾客在外面扫不开
        "public_url": "",
        # 扫码点单首页的经营资质（《医疗器械网络销售质量管理规范》第 11、13、20 条）：
        # 第二类医疗器械经营备案编号（文字显示）、备案凭证图片、售后与投诉电话
        "license_no": "",
        "license_image": "",
        "service_phone": "",
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
        "show_phone": True,
        "show_cashier": True,
        "show_sku": True,
        "show_unit_price": True,
        "show_discount": True,
        "show_payment": True,
        "show_remark": True,
        "show_medical": False,
        "medical_fields": ["reg_cert_no", "production_license_no", "registrant", "production_address"],
        "copies": 1,
        # 排版（含义见 services/receipt.py 的 DEFAULT_STYLE）
        "title_size": "l", "title_bold": True, "title_align": "center",
        "store_size": "s", "store_bold": False,
        "header_size": "s", "header_align": "center",
        "info_size": "s",
        "area_size": "l", "area_bold": True,
        "item_size": "s", "item_bold": True,
        "medical_size": "s",
        "total_size": "m", "total_bold": True,
        "footer_size": "s", "footer_align": "center",
        "separator": "-",
        "line_spacing": "normal",
        "image_width": 60,
        "top_blank": 0,
        "bottom_blank": 4,
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
