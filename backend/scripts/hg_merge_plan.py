"""根据惠管家导出数据生成“商品合并方案”Excel，供人工确认后再导入。

用法：python scripts/hg_merge_plan.py <导出目录> <输出.xlsx>
导出目录里需要 goods.json、stock.json、categories.json、suppliers.json（由只读导出脚本生成）。

合并口径（默认建议，可在 Excel 里改）：
- 名称前缀 **、*、ICU-、NICU-、EICU- 去掉后同名的，视为同一个商品；
- 名称里的“(5片起点)”“(两卷起点)”“(单点5卷起送）”这类起订说明从名称里去掉，转成起订量；
- 同一商品下规格文字统一（㎝→cm、去空格、全角括号）后相同的，视为同一个规格，库存相加；
- 同规格不同版本的售价 / 进价 / 单位 / 供应商不一致时，标为“需确认”，默认取普通版本（没有普通版本取库存最多的版本）的值。
"""
import collections
import difflib
import json
import os
import re
import sys

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill

PRE = re.compile(r"^(\*\*|\*|ICU-?|NICU-?|EICU-?)\s*")
MIN_RE = re.compile(r"[（(]\s*(?:单点)?\s*([0-9一二两三四五六七八九十]+)\s*(片|卷|包|个|条|支|盒|瓶)?\s*(?:起点|起送|起订|起)\s*[）)]")
CN = {"一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}
SKIP_NAMES = ("备注床号", "请务必备注")


def load(d, n):
    with open(os.path.join(d, n + ".json"), encoding="utf-8") as f:
        return json.load(f)


def split_name(name):
    """返回（去前缀和起订说明后的名称、版本、起订量）。"""
    m = PRE.match(name)
    ver = m.group(1).rstrip("-") if m else ""
    rest = name[m.end():] if m else name
    mq = MIN_RE.search(rest)
    min_qty = None
    if mq:
        v = mq.group(1)
        min_qty = int(v) if v.isdigit() else CN.get(v)
        rest = (rest[:mq.start()] + rest[mq.end():])
    rest = rest.replace("（", "(").replace("）", ")").strip()
    return rest, ver or "普通", min_qty


def norm_spec(s):
    s = (s or "").replace("㎝", "cm").replace("（", "(").replace("）", ")").replace("×", "*").replace("＊", "*")
    s = re.sub(r"\s+", "", s).lower()
    s = re.sub(r"\(?(五包起送|单点.*起送)\)?", "", s)
    return s


def money(v):
    try:
        return round(float(v or 0), 2)
    except ValueError:
        return 0.0


def build(d):
    stock = load(d, "stock")
    # 商品档案里有、库存查询里没有的（从没进过货），按库存 0 补上
    have = {s["goodsId"] for s in stock}
    for g in load(d, "goods"):
        if g["id"] not in have:
            stock.append({"goodsId": g["id"], "goodsCode": g.get("goodsCode"), "goodsName": g["goodsName"], "standardName": g.get("standardName"),
                          "salePrice": g.get("salePrice"), "purchasingPrice": g.get("purchasingPrice"), "unitName": g.get("goodsUnitName"),
                          "barCode": g.get("barCode"), "quantity": 0, "categoryName": g.get("categoryName"), "supplierName": g.get("supplierName")})
    rows = []
    for s in stock:
        if any(k in s["goodsName"] for k in SKIP_NAMES):
            continue
        base, ver, min_qty = split_name(s["goodsName"])
        rows.append({"hg_id": s["goodsId"], "hg_code": s.get("goodsCode") or "", "hg_name": s["goodsName"], "base": base, "ver": ver,
                     "min_qty": min_qty, "spec": (s.get("standardName") or "").strip() or "默认", "spec_key": norm_spec(s.get("standardName")),
                     "price": money(s.get("salePrice")), "cost": money(s.get("purchasingPrice")),
                     "unit": (s.get("unitName") or s.get("goodsUnitName") or "").strip(),
                     "barcode": s.get("barCode") or "", "qty": float(s.get("quantity") or 0), "category": s.get("categoryName") or "",
                     "supplier": s.get("supplierName") or ""})
    products = collections.OrderedDict()
    for r in sorted(rows, key=lambda r: (r["base"], r["spec_key"], r["ver"] != "普通", r["ver"])):
        products.setdefault(r["base"], collections.OrderedDict()).setdefault(r["spec_key"], []).append(r)
    return rows, products


def pick(vers):
    normal = [v for v in vers if v["ver"] == "普通"]
    return normal[0] if normal else max(vers, key=lambda v: v["qty"])


def plan(products):
    out = []
    for base, specs in products.items():
        all_vers = [v for vs in specs.values() for v in vs]
        min_qty = max([v["min_qty"] for v in all_vers if v["min_qty"]] or [0]) or None
        cats = list(dict.fromkeys(v["category"] for v in all_vers if v["category"]))
        for key, vers in specs.items():
            main = pick(vers)
            diffs = []
            for field, label in (("price", "售价"), ("cost", "进价"), ("unit", "单位"), ("supplier", "供应商")):
                vals = sorted({str(v[field]) for v in vers})
                if len(vals) > 1:
                    diffs.append(f"{label}不同：" + " / ".join(f"{v['ver']} {v[field]}" for v in vers))
            out.append({"product": base, "spec": main["spec"], "versions": "、".join(v["ver"] for v in vers), "n": len(vers),
                        "price": main["price"], "cost": main["cost"], "unit": main["unit"], "supplier": main["supplier"],
                        "barcode": " / ".join(dict.fromkeys(v["barcode"] for v in vers if v["barcode"])),
                        "qty": round(sum(v["qty"] for v in vers), 3), "qty_detail": "，".join(f"{v['ver']} {v['qty']:g}" for v in vers),
                        "categories": "、".join(cats), "min_qty": min_qty, "diffs": "；".join(diffs),
                        "hg_ids": ",".join(v["hg_id"] for v in vers), "hg_names": " | ".join(dict.fromkeys(v["hg_name"] for v in vers))})
    return out


def suggestions(products):
    """带版本前缀、但找不到同名普通商品的：给出名称相近的候选，供人工判断是不是同一个东西。"""
    plain = [b for b, specs in products.items() if any(v["ver"] == "普通" for vs in specs.values() for v in vs)]
    out = []
    for base, specs in products.items():
        vers = {v["ver"] for vs in specs.values() for v in vs}
        if "普通" in vers:
            continue
        cands = difflib.get_close_matches(base, plain, n=3, cutoff=0.45)
        # 名称互相包含的也算候选
        cands += [p for p in plain if (base in p or p in base) and p not in cands and p != base][:3]
        if cands:
            out.append({"product": base, "versions": "、".join(sorted(vers)), "candidates": "；".join(cands[:4])})
    return out


def write_xlsx(path, plan_rows, sugg, skipped):
    wb = Workbook()
    ws = wb.active
    ws.title = "合并方案"
    head = ["新商品名称", "规格", "合并的版本", "售价", "进价", "单位", "供应商", "条码", "库存合计", "各版本库存", "分类（多个）",
            "起订量", "需确认的差异", "惠管家商品ID", "惠管家原名称"]
    ws.append(head)
    warn = PatternFill("solid", fgColor="FFF4E5")
    for r in plan_rows:
        ws.append([r["product"], r["spec"], r["versions"], r["price"], r["cost"], r["unit"], r["supplier"], r["barcode"], r["qty"],
                   r["qty_detail"], r["categories"], r["min_qty"], r["diffs"], r["hg_ids"], r["hg_names"]])
        if r["diffs"]:
            for c in ws[ws.max_row]:
                c.fill = warn
    for c in ws[1]:
        c.font = Font(bold=True)
    widths = [26, 22, 18, 8, 8, 6, 12, 18, 9, 22, 26, 7, 40, 18, 40]
    for i, w in enumerate(widths):
        ws.column_dimensions[chr(65 + i)].width = w
    ws.freeze_panes = "B2"

    ws2 = wb.create_sheet("可能是同一商品")
    ws2.append(["带前缀的商品（没有同名普通商品）", "版本", "名称相近的商品（请判断是否同一个）", "你的决定（填：合并到 xxx / 不合并）"])
    for s in sugg:
        ws2.append([s["product"], s["versions"], s["candidates"], ""])
    for c in ws2[1]:
        c.font = Font(bold=True)
    for col, w in zip("ABCD", (30, 14, 60, 30)):
        ws2.column_dimensions[col].width = w

    ws3 = wb.create_sheet("不迁移")
    ws3.append(["惠管家名称", "原因"])
    for n in skipped:
        ws3.append([n, "看起来是给顾客的提示，不是商品"])
    for c in ws3[1]:
        c.font = Font(bold=True)
    ws3.column_dimensions["A"].width = 30
    ws3.column_dimensions["B"].width = 30
    for w in (ws, ws2, ws3):
        for row in w.iter_rows():
            for c in row:
                c.alignment = Alignment(vertical="top", wrap_text=True)
    wb.save(path)


if __name__ == "__main__":
    d, out_path = sys.argv[1], sys.argv[2]
    rows, products = build(d)
    p = plan(products)
    s = suggestions(products)
    goods = load(d, "goods")
    skipped = [g["goodsName"] for g in goods if any(k in g["goodsName"] for k in SKIP_NAMES)]
    write_xlsx(out_path, p, s, skipped)
    n_prod = len(products)
    merged = sum(1 for r in p if r["n"] > 1)
    print(json.dumps({"source_skus": len(rows), "products": n_prod, "skus": len(p), "merged_skus": merged,
                      "conflicts": sum(1 for r in p if r["diffs"]), "suggestions": len(s), "skipped": skipped},
                     ensure_ascii=False))
