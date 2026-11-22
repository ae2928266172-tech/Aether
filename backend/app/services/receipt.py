"""小票内容：按后台小票设置，从订单本身动态生成。

返回结构化内容，网页按 58mm 排版打印；同时给出纯文本版本（每行 32 个半角字符宽），
以后接 ESC/POS 小票机直连打印时可以直接用。
"""
import unicodedata

from sqlalchemy.orm import Session

from ..models import Exchange, Order, RefundLine, User
from ..settings_store import get_setting
from .orders import PAY_METHODS

# 排版：字号 s 正常 / m 加高 / l 加大（宽高都放大一倍）；对齐 left / center / right
DEFAULT_STYLE = {
    "title_size": "l", "title_bold": True, "title_align": "center",
    "store_size": "s", "store_bold": False,
    "header_size": "s", "header_align": "center",
    "info_size": "s",
    "item_size": "s", "item_bold": True,
    "medical_size": "s",
    "total_size": "m", "total_bold": True,
    "footer_size": "s", "footer_align": "center",
    "separator": "-",
    "line_spacing": "normal",  # compact 紧凑 / normal 正常 / loose 宽松
    "image_width": 60,  # 底部图片占纸宽的百分比
    "top_blank": 0,  # 顶部空行
    "bottom_blank": 4,  # 底部走纸行数（方便撕纸）
}

MEDICAL_LABELS = {"reg_cert_no": "注册证号", "production_license_no": "生产许可证号",
                  "registrant": "注册人", "production_address": "生产地址"}


def yuan(fen: int) -> str:
    return f"{fen / 100:.2f}"


def _w(s: str) -> int:
    return sum(2 if unicodedata.east_asian_width(c) in "WF" else 1 for c in s)


def _lr(left: str, right: str, width: int) -> str:
    gap = width - _w(left) - _w(right)
    return left + " " * max(1, gap) + right


def _center(s: str, width: int) -> str:
    pad = max(0, (width - _w(s)) // 2)
    return " " * pad + s


def _fill(tpl: str, vars_: dict) -> str:
    for k, v in vars_.items():
        tpl = tpl.replace("{" + k + "}", str(v))
    return tpl


def build_receipt(db: Session, o: Order, user: User | None, reprint: bool = False) -> dict:
    cfg = get_setting(db, "receipt")
    rules = get_setting(db, "rules")
    width = 32 if int(cfg.get("paper_width", 58)) == 58 else 48
    pays = [p for p in o.payments if p.kind == "pay"]
    refunds = [p for p in o.payments if p.kind == "refund"]
    change = sum(p.change for p in pays)
    vars_ = {"单号": o.no, "时间": o.created_at.strftime("%Y-%m-%d %H:%M"), "门店": o.store.name,
             "应收": yuan(o.payable_amount), "找零": yuan(change), "区域": o.area_name, "位置": o.location_note}

    title = _fill(cfg["title"], vars_) if cfg.get("title") else ""
    store_line = o.store.name if cfg.get("show_store") else ""
    header_lines = _fill(cfg["header"], vars_).splitlines() if cfg.get("header") else []
    head = ([title] if title else []) + ([store_line] if store_line else []) + header_lines

    info = []
    if reprint:
        info.append(("", "【补打】"))
    if cfg.get("show_order_no"):
        info.append(("单号", o.no))
    if cfg.get("show_time"):
        info.append(("时间", o.created_at.strftime("%Y-%m-%d %H:%M:%S")))
    if cfg.get("show_area") and o.area_name:
        info.append((rules.get("area_label", "区域"), o.area_name))
        if o.location_note:
            info.append((rules.get("location_label", "位置"), o.location_note))
    if cfg.get("show_cashier") and user:
        info.append(("操作员", user.display_name or user.username))

    items = []
    for i in o.items:
        name = i.product_name + (f"（{i.sku_name}）" if cfg.get("show_sku") and i.sku_name and i.sku_name != "默认" else "")
        row = {"name": name, "qty": i.qty, "unit": i.unit, "unit_price": yuan(i.unit_price) if cfg.get("show_unit_price") else None,
               "amount": yuan(i.amount), "medical": []}
        if cfg.get("show_medical"):
            for k in cfg.get("medical_fields", []):
                v = (i.medical_info or {}).get(k)
                if v:
                    row["medical"].append((MEDICAL_LABELS.get(k, k), v))
        if i.refunded_qty:
            row["refunded_qty"] = i.refunded_qty
        items.append(row)

    totals = [("商品合计", yuan(o.original_amount))]
    if cfg.get("show_discount") and o.discount_amount:
        label = f"优惠（{o.discount_rate / 10:g}折）" if o.discount_rate and o.payable_amount == round(
            o.original_amount * o.discount_rate / 100) else "优惠"
        totals.append((label, "-" + yuan(o.discount_amount)))
    totals.append(("应收", yuan(o.payable_amount)))
    if cfg.get("show_payment"):
        if pays:
            for p in pays:
                totals.append((PAY_METHODS[p.method], yuan(p.received)))
            if change:
                totals.append(("找零", yuan(change)))
        else:
            totals.append(("收款状态", "未收款"))
        for p in refunds:
            totals.append(("退款（" + PAY_METHODS[p.method] + "）", "-" + yuan(p.amount)))

    footer = _fill(cfg.get("footer") or "", vars_).splitlines()
    remark = o.remark if cfg.get("show_remark") and o.remark else ""

    # 纯文本版
    sep = (cfg.get("separator") or "-")[:1] * width
    t = [_center(h, width) for h in head] + [sep]
    t += [(f"{k}：{v}" if k else v) for k, v in info] + [sep]
    for it in items:
        t.append(it["name"])
        left = f"  {it['qty']}{it['unit']}" + (f" × {it['unit_price']}" if it["unit_price"] else "")
        t.append(_lr(left, it["amount"], width))
        for k, v in it["medical"]:
            t.append(f"  {k}：{v}")
    t.append(sep)
    t += [_lr(k, v, width) for k, v in totals]
    if remark:
        t.append("备注：" + remark)
    t.append(sep)
    t += [_center(f, width) for f in footer]

    style = {k: cfg.get(k, DEFAULT_STYLE[k]) for k in DEFAULT_STYLE}
    return {"order_id": o.id, "order_no": o.no, "paper_width": int(cfg.get("paper_width", 58)),
            "copies": int(cfg.get("copies", 1)), "reprint": reprint, "head": head,
            "title": title, "store_line": store_line, "header_lines": header_lines, "style": style,
            "info": [list(x) for x in info], "items": items, "totals": [list(x) for x in totals],
            "remark": remark, "footer": footer, "footer_image": cfg.get("footer_image") or "",
            "text": "\n".join(t)}


def build_exchange_receipt(db: Session, ex: Exchange, user: User | None, reprint: bool = False) -> dict:
    """《售后换货凭证》：原单号、退回商品、换出商品、补收 / 退还差价及方式。格式与收银小票相同，打印方式也相同。"""
    from sqlalchemy import select
    cfg = get_setting(db, "receipt")
    o = db.get(Order, ex.order_id)
    width = 32 if int(cfg.get("paper_width", 58)) == 58 else 48
    title = "售后换货凭证"
    store_line = o.store.name
    head = [title, store_line]
    info = [("", "【补打】")] if reprint else []
    info += [("换货单号", ex.no), ("原单号", o.no), ("时间", ex.created_at.strftime("%Y-%m-%d %H:%M:%S"))]
    if user:
        info.append(("操作员", user.display_name or user.username))
    by_id = {i.id: i for i in o.items}
    items = []
    for ln in db.scalars(select(RefundLine).where(RefundLine.refund_id == ex.refund_id).order_by(RefundLine.id)):
        it = by_id.get(ln.order_item_id)
        if it:
            name = "【退回】" + it.product_name + (f"（{it.sku_name}）" if it.sku_name and it.sku_name != "默认" else "")
            items.append({"name": name, "qty": ln.qty, "unit": it.unit, "unit_price": None,
                          "amount": "-" + yuan(ln.amount), "medical": []})
    for it in o.items:
        if it.exchange_id == ex.id:
            name = "【换出】" + it.product_name + (f"（{it.sku_name}）" if it.sku_name and it.sku_name != "默认" else "")
            items.append({"name": name, "qty": it.qty, "unit": it.unit, "unit_price": yuan(it.unit_price),
                          "amount": yuan(it.paid_share), "medical": []})
    totals = [("退回商品实收", yuan(ex.old_amount)), ("换出商品金额", yuan(ex.new_amount))]
    if ex.new_amount != ex.new_original:
        totals.append(("（现价）", yuan(ex.new_original)))
    if ex.diff > 0:
        totals.append(("补收（" + PAY_METHODS.get(ex.method, ex.method or "") + "）", yuan(ex.diff)))
    elif ex.diff < 0:
        totals.append(("退还（" + PAY_METHODS.get(ex.method, ex.method or "") + "）", yuan(-ex.diff)))
    else:
        totals.append(("差价", "0.00"))
    totals.append(("退回状态", "完好，回可售库存" if ex.condition == "good" else "拆封 / 破损，进残次品库"))
    remark = ("原因：" + ex.reason) if ex.reason else ""
    footer = ["请保留本凭证，作为售后换货依据"]
    sep = (cfg.get("separator") or "-")[:1] * width
    t = [_center(h, width) for h in head] + [sep] + [(f"{k}：{v}" if k else v) for k, v in info] + [sep]
    for it in items:
        t.append(it["name"])
        t.append(_lr(f"  {it['qty']}{it['unit']}" + (f" × {it['unit_price']}" if it["unit_price"] else ""), it["amount"], width))
    t += [sep] + [_lr(k, v, width) for k, v in totals]
    if remark:
        t.append(remark)
    t += [sep] + [_center(f, width) for f in footer]
    style = {k: cfg.get(k, DEFAULT_STYLE[k]) for k in DEFAULT_STYLE}
    return {"order_id": o.id, "order_no": o.no, "exchange_id": ex.id, "paper_width": int(cfg.get("paper_width", 58)),
            "copies": 1, "reprint": reprint, "head": head, "title": title, "store_line": store_line, "header_lines": [],
            "style": style, "info": [list(x) for x in info], "items": items, "totals": [list(x) for x in totals],
            "remark": remark, "footer": footer, "footer_image": "", "text": "\n".join(t)}
