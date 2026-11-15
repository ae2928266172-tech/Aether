"""区域点单规则：某个区域能点哪些商品、每单至少 / 最多点几件。

生效顺序（只影响小程序 / 扫码点单，门店收银不受限）：
1. 商品停用、不在小程序显示 → 哪里都不能点
2. 商品设了“只在指定区域可点” → 不在名单里的区域不能点
3. 区域对这个商品单独设了“不能点” → 不能点
4. 区域勾了“不限数量”（如 ICU）→ 不检查起订、限购
5. 否则：区域单独设的起订 / 限购优先（填 0 表示本区域不限），没设就用商品自己的
数量按这个商品各规格合计算。
"""
from collections import defaultdict
from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Area, AreaProductRule, OrderItem, Product


@dataclass
class Rule:
    allowed: bool
    min_qty: int | None
    max_qty: int | None


def load_rules(db: Session, area: Area) -> dict[int, AreaProductRule]:
    return {r.product_id: r for r in db.scalars(select(AreaProductRule).where(AreaProductRule.area_id == area.id))}


def effective(p: Product, area: Area, rules: dict[int, AreaProductRule]) -> Rule:
    r = rules.get(p.id)
    allowed = p.active and p.online_visible
    if allowed and p.area_limited:
        allowed = area.id in {a.id for a in p.areas}
    if allowed and r is not None and not r.allowed:
        allowed = False
    if area.no_qty_limit:
        return Rule(allowed, None, None)

    def pick(override, base):
        if override is not None:
            return override or None  # 0 = 本区域不限
        return base
    return Rule(allowed, pick(r.min_qty if r else None, p.min_qty), pick(r.max_qty if r else None, p.max_qty))


def check_order(db: Session, area: Area, items: list[OrderItem]):
    rules = load_rules(db, area)
    qty: dict[int, int] = defaultdict(int)
    names: dict[int, str] = {}
    for it in items:
        qty[it.product_id] += it.qty
        names[it.product_id] = it.product_name
    for pid, q in qty.items():
        rule = effective(db.get(Product, pid), area, rules)
        if not rule.allowed:
            raise HTTPException(400, f"{names[pid]} 在{area.name}不能点")
        if rule.min_qty and q < rule.min_qty:
            raise HTTPException(400, f"{names[pid]} 在{area.name}至少要点 {rule.min_qty} 件")
        if rule.max_qty and q > rule.max_qty:
            raise HTTPException(400, f"{names[pid]} 在{area.name}每单最多点 {rule.max_qty} 件")
