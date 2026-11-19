"""关键操作日志。

用法：before = snap(...)；改完 after = snap(...)；record(db, user, "商品修改", "杯装水", before, after)。
只记有变化的字段；金额字段（分）在摘要里换成元，便于查账。
"""
from decimal import Decimal

from sqlalchemy.orm import Session

from .models import AuditLog, User

MONEY = ("price", "cost", "max_adjust_amount")


def _plain(v):
    if isinstance(v, Decimal):
        return float(v) if v != v.to_integral_value() else int(v)
    if isinstance(v, (list, tuple)):
        return [_plain(x) for x in v]
    if isinstance(v, dict):
        return {str(k): _plain(x) for k, x in v.items()}
    return v


def snap(obj, fields) -> dict:
    return {f: _plain(getattr(obj, f)) for f in fields}


def diff(before: dict | None, after: dict | None) -> dict:
    before, after = before or {}, after or {}
    out = {}
    for k in dict.fromkeys([*before, *after]):
        b, a = _plain(before.get(k)), _plain(after.get(k))
        if b != a:
            out[k] = [b, a]
    return out


def yuan(v) -> str:
    return "—" if v is None else f"{v / 100:.2f}"


def record(db: Session, user: User | None, action: str, target: str = "", before: dict | None = None,
           after: dict | None = None, summary: str = "", changes: dict | None = None) -> AuditLog | None:
    ch = changes if changes is not None else diff(before, after)
    if not ch and not summary and (changes is not None or (before is not None and after is not None)):
        return None  # 点了保存但什么都没改
    row = AuditLog(user_id=user.id if user else None, user_name=(user.display_name or user.username) if user else "",
                   action=action, target=str(target)[:100], summary=summary[:500], changes=ch)
    db.add(row)
    return row


# ---------------- 各类对象的快照 ----------------

PRODUCT_FIELDS = ("name", "code", "unit", "online_visible", "active", "min_qty", "max_qty", "area_limited",
                  "reg_cert_no", "registrant", "supplier_id")
SKU_FIELDS = ("name", "barcode", "price", "cost", "stock_item_id", "deduct_qty", "active")


def product_snap(p) -> dict:
    d = snap(p, PRODUCT_FIELDS)
    d["分类"] = sorted(c.name for c in p.categories)
    d["可点区域"] = sorted(a.name for a in p.areas)
    for s in p.skus:
        for f in SKU_FIELDS:
            d[f"规格#{s.id}.{f}"] = _plain(getattr(s, f))
    return d


def name_skus(p, changes: dict) -> dict:
    """把“规格#12.price”换成“规格「小份」售价”这类人看得懂的写法（编号用来对齐改名前后的同一个规格）。"""
    names = {f"规格#{s.id}.": f"规格「{s.name}」." for s in p.skus}
    out = {}
    for k, v in changes.items():
        for a, b in names.items():
            if k.startswith(a):
                k = b + k[len(a):]
                break
        out[k] = v
    return out


def price_summary(p, before: dict, after: dict) -> str:
    parts = []
    for s in p.skus:
        k = f"规格#{s.id}.price"
        if before.get(k) != after.get(k):
            parts.append(f"{s.name} {yuan(before.get(k))}→{yuan(after.get(k))}" if k in before
                         else f"{s.name} 新增 {yuan(after.get(k))}")
    return "改价：" + "；".join(parts) if parts else ""


def user_snap(u) -> dict:
    d = snap(u, ("username", "display_name", "role_id", "active", "min_discount_rate", "max_adjust_amount"))
    d["角色"] = u.role.name if u.role else None
    d["门店"] = sorted(s.name for s in u.stores)
    return d


def role_snap(r) -> dict:
    d = snap(r, ("name", "is_admin", "min_discount_rate", "max_adjust_amount"))
    d["permissions"] = sorted(r.permissions or [])
    return d


STORE_FIELDS = ("name", "address", "phone", "active", "staff_can_view_stock", "staff_can_edit_stock",
                "accept_online_orders", "print_mode", "auto_print_online", "auto_print_pos")
STOCK_ITEM_FIELDS = ("name", "code", "unit", "cost", "supplier_id", "alert_qty", "active")
