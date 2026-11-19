"""数据模型。

金额一律以“分”为单位存整数；库存数量用 Decimal（最多 3 位小数），支持“大份扣 2 份”“半份扣 0.5”等扣减量。
"""
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (JSON, Boolean, Date, DateTime, ForeignKey, Integer, Numeric,
                        String, Text, UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base, now

Qty = Numeric(14, 3, asdecimal=True)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


# ---------------- 账号与权限 ----------------

class Role(Base, TimestampMixin):
    __tablename__ = "roles"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)
    # 后台角色可以访问后台；门店角色只能进门店工作台
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    permissions: Mapped[list] = mapped_column(JSON, default=list)
    # 优惠上限：最低折扣（如 80 表示最低 8 折，本单应收不能低于原价的 80%）；单笔最多调低金额（分），为空不限
    min_discount_rate: Mapped[int] = mapped_column(Integer, default=1)
    max_adjust_amount: Mapped[int | None] = mapped_column(Integer, nullable=True)


class User(Base, TimestampMixin):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    display_name: Mapped[str] = mapped_column(String(50), default="")
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    # 每次改密码或停用时 +1，使旧登录失效
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    # 账号单独的优惠上限，为空时用角色的设置
    min_discount_rate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_adjust_amount: Mapped[int | None] = mapped_column(Integer, nullable=True)
    role: Mapped[Role] = relationship(lazy="joined")
    stores: Mapped[list["Store"]] = relationship(secondary="user_stores", lazy="selectin")


class UserStore(Base):
    __tablename__ = "user_stores"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id", ondelete="CASCADE"), primary_key=True)


# ---------------- 库存地点：仓库与门店 ----------------

class Location(Base, TimestampMixin):
    """库存地点。kind=warehouse 为独立仓库，kind=store 为门店自身库存。"""
    __tablename__ = "locations"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)
    kind: Mapped[str] = mapped_column(String(20))  # warehouse / store
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Store(Base, TimestampMixin):
    __tablename__ = "stores"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)
    address: Mapped[str] = mapped_column(String(200), default="")
    phone: Mapped[str] = mapped_column(String(50), default="")
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"), unique=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    # 后台可限制门店员工查看 / 修改本店库存
    staff_can_view_stock: Mapped[bool] = mapped_column(Boolean, default=False)
    staff_can_edit_stock: Mapped[bool] = mapped_column(Boolean, default=False)
    # 是否接收小程序订单
    accept_online_orders: Mapped[bool] = mapped_column(Boolean, default=True)
    # 出票方式：browser 门店工作台所在电脑用浏览器打印；agent 由接小票机的电脑上的“打印小助手”取票打印
    print_mode: Mapped[str] = mapped_column(String(20), default="browser")
    # 打印小助手凭这个密钥取本店的打印任务
    print_key: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    auto_print_online: Mapped[bool] = mapped_column(Boolean, default=True)  # 新的小程序订单自动出票
    auto_print_pos: Mapped[bool] = mapped_column(Boolean, default=True)  # 收银后自动出票
    agent_seen_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)  # 打印小助手最近一次联网
    location: Mapped[Location] = relationship(lazy="joined")


class Area(Base, TimestampMixin):
    """门店下的区域（病区、楼层、桌区等），每个区域一个二维码。"""
    __tablename__ = "areas"
    id: Mapped[int] = mapped_column(primary_key=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id"))
    name: Mapped[str] = mapped_column(String(50))
    # 二维码里携带的随机码，避免被人按序号猜到其他区域
    code: Mapped[str] = mapped_column(String(32), unique=True)
    sort: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    # 本区域不限点单数量（如 ICU）：商品的起订量、限购量在这里都不生效
    no_qty_limit: Mapped[bool] = mapped_column(Boolean, default=False)
    store: Mapped[Store] = relationship(lazy="joined")
    __table_args__ = (UniqueConstraint("store_id", "name"),)


class AreaProductRule(Base):
    """某个区域对某个商品的单独规则：能不能点、起订量、限购量（为空时用商品自己的设置）。"""
    __tablename__ = "area_product_rules"
    area_id: Mapped[int] = mapped_column(ForeignKey("areas.id", ondelete="CASCADE"), primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), primary_key=True)
    allowed: Mapped[bool] = mapped_column(Boolean, default=True)
    min_qty: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_qty: Mapped[int | None] = mapped_column(Integer, nullable=True)


# ---------------- 商品资料 ----------------

class Category(Base, TimestampMixin):
    __tablename__ = "categories"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50))
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    sort: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Supplier(Base, TimestampMixin):
    __tablename__ = "suppliers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    contact: Mapped[str] = mapped_column(String(50), default="")
    phone: Mapped[str] = mapped_column(String(50), default="")
    remark: Mapped[str] = mapped_column(String(200), default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class StockItem(Base, TimestampMixin):
    """库存品：实际占用库存的东西。多个销售规格可以绑定同一个库存品。"""
    __tablename__ = "stock_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    code: Mapped[str] = mapped_column(String(50), default="")
    unit: Mapped[str] = mapped_column(String(20), default="份")
    cost: Mapped[int] = mapped_column(Integer, default=0)  # 单位成本（分）
    supplier_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id"), nullable=True)
    # 库存预警：任一仓库 / 门店的库存小于等于这个数时提醒补货；为空不提醒
    alert_qty: Mapped[Decimal | None] = mapped_column(Qty, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Product(Base, TimestampMixin):
    """销售商品（顾客看到的名称）。"""
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    code: Mapped[str] = mapped_column(String(50), default="")  # 货号
    # 助记码：默认是名称的拼音首字母，可以手改；收银台输入 zb 就能找到“纸杯”
    mnemonic: Mapped[str] = mapped_column(String(50), default="", index=True)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    unit: Mapped[str] = mapped_column(String(20), default="件")
    image: Mapped[str] = mapped_column(String(300), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    # 医疗器械等详细资料
    reg_cert_no: Mapped[str] = mapped_column(String(100), default="")          # 注册证号 / 备案号
    production_license_no: Mapped[str] = mapped_column(String(100), default="")  # 生产许可证号
    registrant: Mapped[str] = mapped_column(String(200), default="")           # 注册人 / 备案人
    production_address: Mapped[str] = mapped_column(String(300), default="")   # 生产地址
    supplier_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id"), nullable=True)
    online_visible: Mapped[bool] = mapped_column(Boolean, default=True)  # 小程序可见
    # 小程序点单数量：每单这个商品（各规格合计）至少 / 最多点几件；为空不限。区域可以单独覆盖
    min_qty: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_qty: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # 只在指定区域可点（为 True 时只有 areas 里的区域能点）
    area_limited: Mapped[bool] = mapped_column(Boolean, default=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort: Mapped[int] = mapped_column(Integer, default=0)
    skus: Mapped[list["Sku"]] = relationship(back_populates="product", lazy="selectin",
                                             order_by="Sku.sort, Sku.id")
    category: Mapped[Category | None] = relationship(lazy="joined")
    # 一个商品可以同时放在多个分类里（category_id 是第一个，保留兼容）
    categories: Mapped[list[Category]] = relationship(secondary="product_categories", lazy="selectin")
    areas: Mapped[list["Area"]] = relationship(secondary="product_areas", lazy="selectin")
    supplier: Mapped[Supplier | None] = relationship(lazy="joined")


class ProductCategory(Base):
    __tablename__ = "product_categories"
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True)


class ProductArea(Base):
    """商品“只在指定区域可点”时，允许的区域。"""
    __tablename__ = "product_areas"
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), primary_key=True)
    area_id: Mapped[int] = mapped_column(ForeignKey("areas.id", ondelete="CASCADE"), primary_key=True)


class Sku(Base, TimestampMixin):
    """销售规格：每个规格有自己的名称、售价、条码，绑定一个库存品和扣减量。"""
    __tablename__ = "skus"
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    name: Mapped[str] = mapped_column(String(50), default="默认")
    barcode: Mapped[str] = mapped_column(String(50), default="", index=True)
    price: Mapped[int] = mapped_column(Integer)  # 售价（分）
    cost: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 为空时按库存品成本×扣减量
    stock_item_id: Mapped[int | None] = mapped_column(ForeignKey("stock_items.id"), nullable=True)
    deduct_qty: Mapped[Decimal] = mapped_column(Qty, default=Decimal(1))
    image: Mapped[str] = mapped_column(String(300), default="")  # 规格图片，不设时用商品图片
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort: Mapped[int] = mapped_column(Integer, default=0)
    product: Mapped[Product] = relationship(back_populates="skus")
    stock_item: Mapped[StockItem | None] = relationship(lazy="joined")


# ---------------- 库存 ----------------

class StockBalance(Base):
    __tablename__ = "stock_balances"
    id: Mapped[int] = mapped_column(primary_key=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"))
    stock_item_id: Mapped[int] = mapped_column(ForeignKey("stock_items.id"))
    qty: Mapped[Decimal] = mapped_column(Qty, default=Decimal(0))
    __table_args__ = (UniqueConstraint("location_id", "stock_item_id"),)


class StockDoc(Base, TimestampMixin):
    """出入库单据：入库、出库、调拨、盘点调整。"""
    __tablename__ = "stock_docs"
    id: Mapped[int] = mapped_column(primary_key=True)
    no: Mapped[str] = mapped_column(String(32), unique=True)
    kind: Mapped[str] = mapped_column(String(20))  # in / out / transfer / adjust
    from_location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id"), nullable=True)
    to_location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id"), nullable=True)
    business_date: Mapped[datetime] = mapped_column(DateTime, default=now)
    supplier_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id"), nullable=True)
    # 出库原因：领用 / 报损 / 退供应商 / 其他（入库为采购入库等，可空）
    reason: Mapped[str] = mapped_column(String(20), default="")
    remark: Mapped[str] = mapped_column(String(200), default="")
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    # 作废：填错的单据不删除，作废时按原单反向冲回库存，留痕可查
    voided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    voided_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    void_reason: Mapped[str] = mapped_column(String(200), default="")
    # 客户端生成的请求号，防止网络重试导致重复入库
    request_id: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    lines: Mapped[list["StockDocLine"]] = relationship(lazy="selectin")


class StockDocLine(Base):
    __tablename__ = "stock_doc_lines"
    id: Mapped[int] = mapped_column(primary_key=True)
    doc_id: Mapped[int] = mapped_column(ForeignKey("stock_docs.id"))
    stock_item_id: Mapped[int] = mapped_column(ForeignKey("stock_items.id"))
    qty: Mapped[Decimal] = mapped_column(Qty)  # 盘点单为实盘数
    unit_cost: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 单价（分）：入库为进价，其余按库存品成本
    amount: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 金额（分）：数量 × 单价；盘点为盈亏金额
    book_qty: Mapped[Decimal | None] = mapped_column(Qty, nullable=True)  # 盘点时的账面数
    # 入库批次信息（选填）
    batch_no: Mapped[str] = mapped_column(String(50), default="")
    production_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)


class StockMove(Base):
    """库存流水：每一次库存变化一行，台账由流水汇总。qty 正数为增加、负数为减少。"""
    __tablename__ = "stock_moves"
    id: Mapped[int] = mapped_column(primary_key=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"), index=True)
    stock_item_id: Mapped[int] = mapped_column(ForeignKey("stock_items.id"), index=True)
    qty: Mapped[Decimal] = mapped_column(Qty)
    # in 入库 / out 出库 / transfer_in 调入 / transfer_out 调出 / sale 销售 / sale_return 退货回补 / adjust 盘点调整
    kind: Mapped[str] = mapped_column(String(20))
    doc_id: Mapped[int | None] = mapped_column(ForeignKey("stock_docs.id"), nullable=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    balance_after: Mapped[Decimal] = mapped_column(Qty)
    note: Mapped[str] = mapped_column(String(30), default="")  # 如“作废冲回”


class StockBatch(Base, TimestampMixin):
    """批次：某地点某库存品的一个批号 / 有效期，qty 为这个批次还剩多少。

    批次是库存之上的明细：入库时填了批号或日期才有批次；出库、调拨、销售先扣最早到期的批次，
    调拨时批次跟着走到门店。没有批次信息的库存不在这里（批次合计可以小于库存）。
    """
    __tablename__ = "stock_batches"
    id: Mapped[int] = mapped_column(primary_key=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"), index=True)
    stock_item_id: Mapped[int] = mapped_column(ForeignKey("stock_items.id"), index=True)
    batch_no: Mapped[str] = mapped_column(String(50), default="")
    production_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    qty: Mapped[Decimal] = mapped_column(Qty, default=Decimal(0))


class BatchMove(Base):
    """每笔库存流水动了哪些批次、各多少（作废、退货时按它原样冲回）。"""
    __tablename__ = "batch_moves"
    id: Mapped[int] = mapped_column(primary_key=True)
    move_id: Mapped[int] = mapped_column(ForeignKey("stock_moves.id"), index=True)
    batch_id: Mapped[int] = mapped_column(ForeignKey("stock_batches.id"), index=True)
    qty: Mapped[Decimal] = mapped_column(Qty)


class Requisition(Base):
    """门店要货申请：门店提，仓库照单（可改数量）调拨，调拨单号记在这里。

    status：pending 待处理 / done 已调拨 / rejected 已驳回 / cancelled 门店已撤回
    """
    __tablename__ = "requisitions"
    id: Mapped[int] = mapped_column(primary_key=True)
    no: Mapped[str] = mapped_column(String(32), unique=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    remark: Mapped[str] = mapped_column(String(200), default="")
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)
    handled_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    handled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    handle_note: Mapped[str] = mapped_column(String(200), default="")  # 驳回原因 / 处理备注
    transfer_doc_id: Mapped[int | None] = mapped_column(ForeignKey("stock_docs.id"), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    lines: Mapped[list["RequisitionLine"]] = relationship(lazy="selectin", order_by="RequisitionLine.id")


class RequisitionLine(Base):
    __tablename__ = "requisition_lines"
    id: Mapped[int] = mapped_column(primary_key=True)
    requisition_id: Mapped[int] = mapped_column(ForeignKey("requisitions.id"), index=True)
    stock_item_id: Mapped[int] = mapped_column(ForeignKey("stock_items.id"))
    qty: Mapped[Decimal] = mapped_column(Qty)  # 门店要的数量
    sent_qty: Mapped[Decimal | None] = mapped_column(Qty, nullable=True)  # 实际调拨的数量


class Shift(Base):
    """收银员交班：开班时点备用金，交班时按这段时间自己经手的收款算应有现金，填实点现金算差额。"""
    __tablename__ = "shifts"
    id: Mapped[int] = mapped_column(primary_key=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)  # open 当班 / closed 已交班
    started_at: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    opening_cash: Mapped[int] = mapped_column(Integer, default=0)  # 备用金（分）
    counted_cash: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 交班实点现金
    expected_cash: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 应有现金 = 备用金 + 现金收款 − 现金退款
    cash_diff: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 实点 − 应有（正为长款，负为短款）
    summary: Mapped[dict] = mapped_column(JSON, default=dict)  # 交班时各收款方式的汇总快照
    remark: Mapped[str] = mapped_column(String(200), default="")


# ---------------- 订单 ----------------

class Customer(Base, TimestampMixin):
    """小程序顾客，凭微信 openid 识别，免手动注册。"""
    __tablename__ = "customers"
    id: Mapped[int] = mapped_column(primary_key=True)
    openid: Mapped[str] = mapped_column(String(64), unique=True)
    nickname: Mapped[str] = mapped_column(String(50), default="")
    phone: Mapped[str] = mapped_column(String(20), default="")


class Order(Base, TimestampMixin):
    """订单。门店收银单和小程序订单都在这里，用 source 区分。

    status：pending 待接单 → accepted 已接单 → completed 已完成；cancelled 已取消
    pay_status：unpaid 未收款 / paid 已收款 / partial_refunded 部分退款 / refunded 已全额退款
    """
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    no: Mapped[str] = mapped_column(String(32), unique=True)
    source: Mapped[str] = mapped_column(String(20))  # pos / online
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id"), index=True)
    area_id: Mapped[int | None] = mapped_column(ForeignKey("areas.id"), nullable=True)
    area_name: Mapped[str] = mapped_column(String(50), default="")
    location_note: Mapped[str] = mapped_column(String(100), default="")  # 床号 / 桌号等
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id"), nullable=True)
    contact_phone: Mapped[str] = mapped_column(String(20), default="")
    remark: Mapped[str] = mapped_column(String(200), default="")
    status: Mapped[str] = mapped_column(String(20), index=True)
    pay_status: Mapped[str] = mapped_column(String(20), default="unpaid")
    original_amount: Mapped[int] = mapped_column(Integer, default=0)  # 商品原价合计
    discount_rate: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 折扣，如 95 表示 9.5 折
    payable_amount: Mapped[int] = mapped_column(Integer, default=0)  # 本次应收
    paid_amount: Mapped[int] = mapped_column(Integer, default=0)
    refunded_amount: Mapped[int] = mapped_column(Integer, default=0)
    stock_deducted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    accepted_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    cancel_reason: Mapped[str] = mapped_column(String(200), default="")
    print_count: Mapped[int] = mapped_column(Integer, default=0)
    request_id: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    items: Mapped[list["OrderItem"]] = relationship(lazy="selectin", order_by="OrderItem.id")
    payments: Mapped[list["Payment"]] = relationship(lazy="selectin", order_by="Payment.id")
    store: Mapped[Store] = relationship(lazy="joined")

    @property
    def discount_amount(self) -> int:
        return self.original_amount - self.payable_amount


class OrderItem(Base):
    __tablename__ = "order_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    sku_id: Mapped[int] = mapped_column(ForeignKey("skus.id"), index=True)
    # 下单时的快照，之后改商品资料不影响历史订单和补打
    product_name: Mapped[str] = mapped_column(String(100))
    sku_name: Mapped[str] = mapped_column(String(50))
    unit: Mapped[str] = mapped_column(String(20), default="件")
    qty: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[int] = mapped_column(Integer)
    amount: Mapped[int] = mapped_column(Integer)  # 原价小计
    paid_share: Mapped[int] = mapped_column(Integer, default=0)  # 优惠分摊后的实收
    unit_cost: Mapped[int] = mapped_column(Integer, default=0)
    stock_item_id: Mapped[int | None] = mapped_column(ForeignKey("stock_items.id"), nullable=True)
    deduct_qty: Mapped[Decimal] = mapped_column(Qty, default=Decimal(1))
    refunded_qty: Mapped[int] = mapped_column(Integer, default=0)
    medical_info: Mapped[dict] = mapped_column(JSON, default=dict)


class Payment(Base):
    """收款 / 退款记录。method：cash 现金、wechat 微信、alipay 支付宝、other 其他。

    注意：这里只是“店员确认已收款”的记账，不代表接入了在线支付。
    """
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    kind: Mapped[str] = mapped_column(String(10))  # pay / refund
    method: Mapped[str] = mapped_column(String(20))
    amount: Mapped[int] = mapped_column(Integer)
    received: Mapped[int] = mapped_column(Integer, default=0)  # 现金实收（找零用）
    change: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    refund_id: Mapped[int | None] = mapped_column(ForeignKey("refunds.id"), nullable=True)


class Refund(Base):
    __tablename__ = "refunds"
    id: Mapped[int] = mapped_column(primary_key=True)
    no: Mapped[str] = mapped_column(String(32), unique=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    amount: Mapped[int] = mapped_column(Integer)
    restock: Mapped[bool] = mapped_column(Boolean, default=True)
    reason: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    lines: Mapped[list["RefundLine"]] = relationship(lazy="selectin")


class RefundLine(Base):
    __tablename__ = "refund_lines"
    id: Mapped[int] = mapped_column(primary_key=True)
    refund_id: Mapped[int] = mapped_column(ForeignKey("refunds.id"))
    order_item_id: Mapped[int] = mapped_column(ForeignKey("order_items.id"))
    qty: Mapped[int] = mapped_column(Integer)
    amount: Mapped[int] = mapped_column(Integer)


class OrderLog(Base):
    __tablename__ = "order_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    action: Mapped[str] = mapped_column(String(30))
    detail: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class AuditLog(Base):
    """关键操作日志：谁、什么时候、做了什么、改前改后。只增不改。"""
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    at: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    user_name: Mapped[str] = mapped_column(String(50), default="")
    action: Mapped[str] = mapped_column(String(30), index=True)  # 改价、商品修改、角色权限、账号、库存单据、单据作废、退款……
    target: Mapped[str] = mapped_column(String(100), default="")  # 对象名称，如“杯装水”“一号店”“RK2026…”
    summary: Mapped[str] = mapped_column(String(500), default="")
    changes: Mapped[dict] = mapped_column(JSON, default=dict)  # {字段: [改前, 改后]}


class PrintJob(Base):
    """打印任务队列（打印小助手模式）。小票内容在取票时按订单当前实际内容生成。"""
    __tablename__ = "print_jobs"
    id: Mapped[int] = mapped_column(primary_key=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id"), index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id"), nullable=True)  # 测试页为空
    kind: Mapped[str] = mapped_column(String(20))  # new_order 新订单 / pos 收银 / reprint 补打 / test 测试
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)  # pending / sent / done / failed
    attempts: Mapped[int] = mapped_column(Integer, default=0)  # 已发给小助手的次数
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    done_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)


# ---------------- 设置 ----------------

class Setting(Base):
    """全局设置（键值）。小票模板、业务规则开关等。"""
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON)
