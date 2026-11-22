"""把数据库对象转成接口返回的字典。金额单位：分；数量：数字。"""
from decimal import Decimal

from .models import Area, Order, Product, Refund, Sku, StockItem, Store, User
from .services.orders import PAY_METHODS, PAY_STATUS_TEXT, STATUS_TEXT


def num(q) -> float | int:
    if q is None:
        return 0
    d = Decimal(q)
    return int(d) if d == d.to_integral_value() else float(d)


def dt(v):
    return v.strftime("%Y-%m-%d %H:%M:%S") if v else None


def user_out(u: User) -> dict:
    return {"id": u.id, "username": u.username, "display_name": u.display_name, "role_id": u.role_id,
            "role_name": u.role.name, "is_admin": u.role.is_admin, "permissions": u.role.permissions or [],
            "active": u.active, "min_discount_rate": u.min_discount_rate, "max_adjust_amount": u.max_adjust_amount,
            "role_min_discount_rate": u.role.min_discount_rate, "role_max_adjust_amount": u.role.max_adjust_amount,
            "stores": [{"id": s.id, "name": s.name} for s in u.stores]}


def store_out(s: Store) -> dict:
    return {"id": s.id, "name": s.name, "address": s.address, "phone": s.phone, "active": s.active,
            "location_id": s.location_id, "staff_can_view_stock": s.staff_can_view_stock,
            "staff_can_edit_stock": s.staff_can_edit_stock, "accept_online_orders": s.accept_online_orders,
            "print_mode": s.print_mode, "auto_print_online": s.auto_print_online, "auto_print_pos": s.auto_print_pos}


def area_out(a: Area) -> dict:
    return {"id": a.id, "store_id": a.store_id, "store_name": a.store.name, "name": a.name, "code": a.code,
            "sort": a.sort, "active": a.active, "no_qty_limit": a.no_qty_limit}


def stock_item_out(i: StockItem) -> dict:
    return {"id": i.id, "name": i.name, "code": i.code, "unit": i.unit, "cost": i.cost,
            "supplier_id": i.supplier_id, "active": i.active,
            "alert_qty": None if i.alert_qty is None else num(i.alert_qty)}


def sku_out(s: Sku) -> dict:
    return {"id": s.id, "name": s.name, "barcode": s.barcode, "price": s.price, "cost": s.cost,
            "stock_item_id": s.stock_item_id, "stock_item_name": s.stock_item.name if s.stock_item else None,
            "deduct_qty": num(s.deduct_qty), "image": s.image or "", "active": s.active, "sort": s.sort}


MEDICAL_FIELDS = {"reg_cert_no": "注册证号", "production_license_no": "生产许可证号",
                  "registrant": "注册人", "production_address": "生产地址"}


def product_cat_ids(p: Product) -> list[int]:
    ids = [c.id for c in p.categories]
    if p.category_id and p.category_id not in ids:  # 旧数据只有 category_id
        ids.insert(0, p.category_id)
    return ids


from .services.skus import sort_skus  # noqa: E402


def product_out(p: Product, admin: bool = True) -> dict:
    cats = {c.id: c.name for c in p.categories}
    if p.category:
        cats.setdefault(p.category.id, p.category.name)
    ids = product_cat_ids(p)
    d = {"id": p.id, "name": p.name, "code": p.code, "mnemonic": p.mnemonic or "", "category_id": p.category_id, "category_ids": ids,
         "category_name": "、".join(cats[i] for i in ids if i in cats) or None, "unit": p.unit, "image": p.image,
         "description": p.description, "online_visible": p.online_visible, "active": p.active, "sort": p.sort,
         "min_qty": p.min_qty, "max_qty": p.max_qty,
         "skus": [sku_out(s) for s in sort_skus(p.skus) if admin or s.active]}
    if admin:
        d["area_limited"] = p.area_limited
        d["area_ids"] = [a.id for a in p.areas]
    for k in MEDICAL_FIELDS:
        d[k] = getattr(p, k)
    if admin:
        d["supplier_id"] = p.supplier_id
        d["supplier_name"] = p.supplier.name if p.supplier else None
    else:
        for s in d["skus"]:
            s.pop("cost", None)
    return d


def order_out(o: Order, detail: bool = True) -> dict:
    d = {"id": o.id, "no": o.no, "source": o.source, "source_text": "门店收银" if o.source == "pos" else "小程序",
         "store_id": o.store_id, "store_name": o.store.name, "area_id": o.area_id, "area_name": o.area_name,
         "location_note": o.location_note, "contact_phone": o.contact_phone, "remark": o.remark,
         "status": o.status, "status_text": STATUS_TEXT[o.status], "pay_status": o.pay_status,
         "pay_status_text": PAY_STATUS_TEXT[o.pay_status], "original_amount": o.original_amount,
         "discount_rate": o.discount_rate, "discount_amount": o.discount_amount,
         "payable_amount": o.payable_amount, "paid_amount": o.paid_amount, "refunded_amount": o.refunded_amount,
         "item_count": sum(i.qty for i in o.items if i.added_at is None), "created_at": dt(o.created_at), "paid_at": dt(o.paid_at),
         "accepted_at": dt(o.accepted_at), "completed_at": dt(o.completed_at), "cancelled_at": dt(o.cancelled_at),
         "cancel_reason": o.cancel_reason, "print_count": o.print_count}
    if detail:
        d["items"] = [{"id": i.id, "product_id": i.product_id, "sku_id": i.sku_id, "product_name": i.product_name,
                       "sku_name": i.sku_name, "unit": i.unit, "qty": i.qty, "unit_price": i.unit_price,
                       "amount": i.amount, "paid_share": i.paid_share, "refunded_qty": i.refunded_qty,
                       "added_at": dt(i.added_at), "medical_info": i.medical_info or {}} for i in o.items]
        d["payments"] = [{"id": p.id, "kind": p.kind, "method": p.method, "method_text": PAY_METHODS[p.method],
                          "amount": p.amount, "received": p.received, "change": p.change,
                          "created_at": dt(p.created_at)} for p in o.payments]
    return d


def refund_out(r: Refund) -> dict:
    return {"id": r.id, "no": r.no, "order_id": r.order_id, "amount": r.amount, "restock": r.restock,
            "kind": r.kind or "refund", "reason": r.reason, "created_at": dt(r.created_at),
            "lines": [{"order_item_id": ln.order_item_id, "qty": ln.qty, "amount": ln.amount} for ln in r.lines]}
