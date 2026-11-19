"""商品资料：分类、供应商、库存品、商品与规格、图片上传。"""
import os
import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Area, Category, Product, ProductCategory, Sku, StockItem, Supplier, User
from ..security import current_user, has_perm, require
from ..serialize import product_out, stock_item_out
from ..services.mnemonic import make_mnemonic

router = APIRouter(prefix="/api", tags=["商品资料"])
MEDIA_DIR = os.environ.get("SHOUYIN_MEDIA") or os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "media")


# ---------------- 分类 ----------------

class CategoryIn(BaseModel):
    name: str = Field(min_length=1)
    parent_id: int | None = None
    sort: int = 0
    active: bool = True


def _cat_out(c: Category):
    return {"id": c.id, "name": c.name, "parent_id": c.parent_id, "sort": c.sort, "active": c.active}


@router.get("/categories")
def list_categories(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return [_cat_out(c) for c in db.scalars(select(Category).order_by(Category.sort, Category.id))]


@router.post("/categories")
def create_category(body: CategoryIn, db: Session = Depends(get_db), _: User = Depends(require("catalog"))):
    if body.parent_id and not db.get(Category, body.parent_id):
        raise HTTPException(400, "上级分类不存在")
    c = Category(**body.model_dump())
    db.add(c)
    db.commit()
    return _cat_out(c)


@router.put("/categories/{cid}")
def update_category(cid: int, body: CategoryIn, db: Session = Depends(get_db), _: User = Depends(require("catalog"))):
    c = db.get(Category, cid)
    if not c:
        raise HTTPException(404, "分类不存在")
    if body.parent_id == cid:
        raise HTTPException(400, "上级分类不能是自己")
    for k, v in body.model_dump().items():
        setattr(c, k, v)
    db.commit()
    return _cat_out(c)


# ---------------- 供应商 ----------------

class SupplierIn(BaseModel):
    name: str = Field(min_length=1)
    contact: str = ""
    phone: str = ""
    remark: str = ""
    active: bool = True


def _sup_out(s: Supplier):
    return {"id": s.id, "name": s.name, "contact": s.contact, "phone": s.phone, "remark": s.remark, "active": s.active}


@router.get("/suppliers")
def list_suppliers(db: Session = Depends(get_db), _: User = Depends(require("catalog"))):
    return [_sup_out(s) for s in db.scalars(select(Supplier).order_by(Supplier.id))]


@router.post("/suppliers")
def create_supplier(body: SupplierIn, db: Session = Depends(get_db), _: User = Depends(require("catalog"))):
    if db.scalar(select(Supplier).where(Supplier.name == body.name)):
        raise HTTPException(400, "供应商已存在")
    s = Supplier(**body.model_dump())
    db.add(s)
    db.commit()
    return _sup_out(s)


@router.put("/suppliers/{sid}")
def update_supplier(sid: int, body: SupplierIn, db: Session = Depends(get_db), _: User = Depends(require("catalog"))):
    s = db.get(Supplier, sid)
    if not s:
        raise HTTPException(404, "供应商不存在")
    for k, v in body.model_dump().items():
        setattr(s, k, v)
    db.commit()
    return _sup_out(s)


# ---------------- 库存品 ----------------

class StockItemIn(BaseModel):
    name: str = Field(min_length=1)
    code: str = ""
    unit: str = "份"
    cost: int = 0
    supplier_id: int | None = None
    alert_qty: Decimal | None = Field(None, ge=0)  # 库存预警量，为空不提醒
    active: bool = True


@router.get("/stock-items")
def list_stock_items(db: Session = Depends(get_db), user: User = Depends(current_user)):
    if not any(has_perm(user, p) for p in ("catalog", "inventory", "stock_view", "requisition")):
        raise HTTPException(403, "没有权限")
    rows = [stock_item_out(i) for i in db.scalars(select(StockItem).order_by(StockItem.id))]
    if not has_perm(user, "catalog"):
        for r in rows:
            r.pop("cost")
    return rows


@router.post("/stock-items")
def create_stock_item(body: StockItemIn, db: Session = Depends(get_db), _: User = Depends(require("catalog"))):
    if db.scalar(select(StockItem).where(StockItem.name == body.name)):
        raise HTTPException(400, "库存品名称已存在")
    i = StockItem(**body.model_dump())
    db.add(i)
    db.commit()
    return stock_item_out(i)


@router.put("/stock-items/{iid}")
def update_stock_item(iid: int, body: StockItemIn, db: Session = Depends(get_db), _: User = Depends(require("catalog"))):
    i = db.get(StockItem, iid)
    if not i:
        raise HTTPException(404, "库存品不存在")
    for k, v in body.model_dump().items():
        setattr(i, k, v)
    db.commit()
    return stock_item_out(i)


# ---------------- 商品与规格 ----------------

class SkuIn(BaseModel):
    id: int | None = None
    name: str = "默认"
    barcode: str = ""
    price: int = Field(ge=0)
    cost: int | None = None
    stock_item_id: int | None = None
    deduct_qty: Decimal = Decimal(1)
    image: str = Field("", max_length=300)
    active: bool = True
    sort: int = 0


class ProductIn(BaseModel):
    name: str = Field(min_length=1)
    code: str = ""
    mnemonic: str = Field("", max_length=50)  # 留空时按名称自动生成拼音首字母
    category_id: int | None = None
    unit: str = "件"
    image: str = ""
    description: str = ""
    reg_cert_no: str = ""
    production_license_no: str = ""
    registrant: str = ""
    production_address: str = ""
    online_visible: bool = True
    active: bool = True
    sort: int = 0
    supplier_id: int | None = None
    category_ids: list[int] | None = None  # 多个分类；不传时用 category_id
    min_qty: int | None = Field(None, ge=1)  # 小程序每单起订量
    max_qty: int | None = Field(None, ge=1)  # 小程序每单限购量
    area_limited: bool = False  # 只在指定区域可点
    area_ids: list[int] = []
    skus: list[SkuIn] = Field(min_length=1)


def _cat_ids(body: ProductIn) -> list[int]:
    ids = body.category_ids if body.category_ids is not None else ([body.category_id] if body.category_id else [])
    return list(dict.fromkeys(i for i in ids if i))


def _check_product(db: Session, body: ProductIn, pid: int | None):
    for cid in _cat_ids(body):
        if not db.get(Category, cid):
            raise HTTPException(400, "分类不存在")
    if body.min_qty and body.max_qty and body.min_qty > body.max_qty:
        raise HTTPException(400, "起订量不能大于限购量")
    if body.area_limited and not body.area_ids:
        raise HTTPException(400, "选了“只在指定区域可点”，请至少勾选一个区域")
    for aid in body.area_ids:
        if not db.get(Area, aid):
            raise HTTPException(400, "区域不存在")
    if body.supplier_id and not db.get(Supplier, body.supplier_id):
        raise HTTPException(400, "供应商不存在")
    names = [s.name.strip() for s in body.skus]
    if len(set(names)) != len(names):
        raise HTTPException(400, "同一商品的规格名称不能重复")
    for s in body.skus:
        if s.stock_item_id and not db.get(StockItem, s.stock_item_id):
            raise HTTPException(400, "绑定的库存品不存在")
        if s.deduct_qty <= 0:
            raise HTTPException(400, "扣减量必须大于 0")
    # 同一个条码可以对应多个规格（厂家一个条码多个尺码的情况很常见），扫码时让店员选；
    # 只是同一个商品里两个规格不能填同一个条码
    codes = [s.barcode for s in body.skus if s.barcode and s.active]
    if len(codes) != len(set(codes)):
        raise HTTPException(400, "同一商品的两个规格不能用同一个条码")


def _apply_product(db: Session, p: Product, body: ProductIn):
    ids = _cat_ids(body)
    for k, v in body.model_dump(exclude={"skus", "category_ids", "area_ids", "category_id"}).items():
        setattr(p, k, v)
    p.mnemonic = (body.mnemonic or "").strip().lower() or make_mnemonic(body.name)
    p.category_id = ids[0] if ids else None
    p.categories = [db.get(Category, i) for i in ids]
    p.areas = [db.get(Area, i) for i in body.area_ids] if body.area_limited else []
    _apply_skus(db, p, body.skus)


def _apply_skus(db: Session, p: Product, skus: list[SkuIn]):
    existing = {s.id: s for s in p.skus}
    keep = set()
    for i, s in enumerate(skus):
        data = s.model_dump(exclude={"id"})
        data["name"] = data["name"].strip() or "默认"
        if s.id and s.id in existing:
            row = existing[s.id]
            for k, v in data.items():
                setattr(row, k, v)
            keep.add(s.id)
        else:
            p.skus.append(Sku(**data))
    # 已删除的规格只停用，不物理删除，历史订单仍能查到
    for sid, row in existing.items():
        if sid not in keep:
            row.active = False


@router.get("/products")
def list_products(keyword: str = "", category_id: int | None = None, include_inactive: bool = False,
                  export: bool = False, db: Session = Depends(get_db), user: User = Depends(current_user)):
    q = select(Product).order_by(Product.sort, Product.id)
    if keyword:
        q = q.where(Product.name.contains(keyword) | Product.code.contains(keyword)
                    | Product.mnemonic.contains(keyword.strip().lower())
                    | Product.id.in_(select(Sku.product_id).where(Sku.barcode == keyword)))
    if category_id:
        cats = select(Category.id).where((Category.parent_id == category_id) | (Category.id == category_id))
        q = q.where(Product.category_id.in_(cats)
                    | Product.id.in_(select(ProductCategory.product_id).where(ProductCategory.category_id.in_(cats))))
    admin = has_perm(user, "catalog")
    if export and not admin:
        raise HTTPException(403, "没有权限")
    if not (admin and include_inactive):
        q = q.where(Product.active.is_(True))
    if export:
        return _export_products(db.scalars(q).all())
    return [product_out(p, admin=admin) for p in db.scalars(q)]


def _export_products(products: list[Product]):
    """商品资料导出：每个规格一行（备份、核对、发给别人看）。"""
    from .reports import _xlsx
    yuan = lambda v: None if v is None else v / 100
    rows = []
    for p in products:
        d = product_out(p)
        for s in d["skus"]:
            rows.append([d["name"], d["code"], d["mnemonic"], d["category_name"] or "", d["unit"], s["name"],
                         s["barcode"], yuan(s["price"]), yuan(s["cost"]), s["stock_item_name"] or "", s["deduct_qty"],
                         d["supplier_name"] or "", "是" if d["online_visible"] else "否",
                         "启用" if d["active"] and s["active"] else "停用", d["reg_cert_no"],
                         d["production_license_no"], d["registrant"], d["production_address"]])
    header = ["商品名称", "货号", "助记码", "分类", "单位", "规格", "条码", "售价", "成本", "库存品", "扣减量", "供应商",
              "小程序可见", "状态", "注册证号 / 备案号", "生产许可证号", "注册人 / 备案人", "生产地址"]
    return _xlsx("商品资料", header, rows, "商品资料")


@router.get("/products/by-barcode/{code}")
def by_barcode(code: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """按条码（或货号）找规格。一个条码对应多个规格时，matches 里列出全部，由收银台让店员选。"""
    admin = has_perm(user, "catalog")
    skus = [s for s in db.scalars(select(Sku).where(Sku.barcode == code, Sku.active.is_(True))) if s.product.active]
    if not skus:
        p = db.scalar(select(Product).where(Product.code == code, Product.active.is_(True)))
        if p:
            skus = [s for s in p.skus if s.active]
    if not skus:
        raise HTTPException(404, f"没有找到条码 {code}")
    matches = [{"product": product_out(s.product, admin=admin), "sku_id": s.id} for s in skus]
    return {**matches[0], "matches": matches}


@router.get("/products/{pid}")
def get_product(pid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    p = db.get(Product, pid)
    if not p:
        raise HTTPException(404, "商品不存在")
    return product_out(p, admin=has_perm(user, "catalog"))


@router.post("/products")
def create_product(body: ProductIn, db: Session = Depends(get_db), _: User = Depends(require("catalog"))):
    _check_product(db, body, None)
    p = Product()
    db.add(p)
    _apply_product(db, p, body)
    db.commit()
    db.refresh(p)
    return product_out(p)


@router.put("/products/{pid}")
def update_product(pid: int, body: ProductIn, db: Session = Depends(get_db), _: User = Depends(require("catalog"))):
    p = db.get(Product, pid)
    if not p:
        raise HTTPException(404, "商品不存在")
    _check_product(db, body, pid)
    _apply_product(db, p, body)
    db.commit()
    db.refresh(p)
    return product_out(p)


# ---------------- 图片上传 ----------------

ALLOWED = {"image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp"}


@router.post("/uploads")
async def upload(file: UploadFile = File(...), user: User = Depends(current_user)):
    if not (has_perm(user, "catalog") or has_perm(user, "receipt_config")):
        raise HTTPException(403, "没有上传权限")
    ext = ALLOWED.get(file.content_type or "")
    if not ext:
        raise HTTPException(400, "只能上传 PNG、JPG、GIF、WEBP 图片")
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(400, "图片不能超过 5MB")
    os.makedirs(MEDIA_DIR, exist_ok=True)
    name = uuid.uuid4().hex + ext
    with open(os.path.join(MEDIA_DIR, name), "wb") as f:
        f.write(data)
    return {"url": "/media/" + name}
