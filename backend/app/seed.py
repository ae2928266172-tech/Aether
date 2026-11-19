"""首次启动时建表并写入默认角色、管理员账号和中心仓库。"""
import os

from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import Base
from .models import Location, Role, User
from .security import PERMISSIONS, hash_password

STORE_PERMS = ["pos", "orders", "refund", "discount", "adjust_amount", "reprint", "stock_view", "requisition"]


def _add_missing_columns(engine):
    """简单升级：新版本给已有表加了字段时，自动补上（只加字段，不删不改）。"""
    from sqlalchemy import inspect, text
    with engine.begin() as conn:
        insp = inspect(conn)  # 用同一个连接查表结构，别另开连接（SQLite 上会和这里的写锁互相等）
        for table in Base.metadata.sorted_tables:
            if not insp.has_table(table.name):
                continue
            have = {c["name"] for c in insp.get_columns(table.name)}
            for col in table.columns:
                if col.name in have:
                    continue
                ddl = col.type.compile(dialect=engine.dialect)
                default = col.default.arg if col.default is not None and not callable(col.default.arg) else None
                sql = f'ALTER TABLE {table.name} ADD COLUMN {col.name} {ddl}'
                if isinstance(default, bool):
                    if engine.dialect.name == "sqlite":
                        sql += f" DEFAULT {int(default)}"
                    else:
                        sql += " DEFAULT " + ("TRUE" if default else "FALSE")
                elif isinstance(default, (int, float)):
                    sql += f" DEFAULT {default}"
                elif isinstance(default, str):
                    sql += " DEFAULT '" + default.replace("'", "''") + "'"
                conn.execute(text(sql))


def init_db(engine, session_factory):
    Base.metadata.create_all(engine)
    _add_missing_columns(engine)
    with session_factory() as db:
        seed(db)
        fill_mnemonics(db)
        migrate_perms(db)
        db.commit()


def migrate_perms(db: Session):
    """新版本加的权限，一次性补给已有角色（之后管理员取消勾选不会被加回来）。"""
    from .models import Setting
    row = db.get(Setting, "_migrations")
    done = set((row.value or {}).get("done", [])) if row else set()
    if "requisition_perm" not in done:
        for r in db.scalars(select(Role)):
            perms = list(r.permissions or [])
            # 后台管理员全给；能收银的门店角色给“要货申请”
            if (r.is_admin and "inventory" in perms) or (not r.is_admin and "pos" in perms):
                if "requisition" not in perms:
                    r.permissions = perms + ["requisition"]
        done.add("requisition_perm")
    if row:
        row.value = {"done": sorted(done)}
    else:
        db.add(Setting(key="_migrations", value={"done": sorted(done)}))


def fill_mnemonics(db: Session):
    """老数据（含惠管家导入的商品）没有助记码的，按名称补上。"""
    from .models import Product
    from .services.mnemonic import make_mnemonic
    for p in db.scalars(select(Product).where((Product.mnemonic == "") | Product.mnemonic.is_(None))):
        p.mnemonic = make_mnemonic(p.name)


def seed(db: Session):
    if not db.scalar(select(Role).limit(1)):
        db.add(Role(name="后台管理员", is_admin=True, permissions=list(PERMISSIONS)))
        db.add(Role(name="门店店员", is_admin=False, permissions=STORE_PERMS))
        db.flush()
    if not db.scalar(select(User).limit(1)):
        admin_role = db.scalar(select(Role).where(Role.is_admin.is_(True)).order_by(Role.id))
        pw = os.environ.get("SHOUYIN_ADMIN_PASSWORD", "admin123")
        db.add(User(username="admin", display_name="管理员", password_hash=hash_password(pw), role_id=admin_role.id))
    if not db.scalar(select(Location).where(Location.kind == "warehouse").limit(1)):
        db.add(Location(name="中心仓库", kind="warehouse"))
    db.flush()
