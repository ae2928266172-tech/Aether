"""首次启动时建表并写入默认角色、管理员账号和中心仓库。"""
import os

from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import Base
from .models import Location, Role, User
from .security import PERMISSIONS, hash_password

STORE_PERMS = ["pos", "orders", "refund", "discount", "adjust_amount", "reprint", "stock_view"]


def _add_missing_columns(engine):
    """简单升级：新版本给已有表加了字段时，自动补上（只加字段，不删不改）。"""
    from sqlalchemy import inspect, text
    insp = inspect(engine)
    with engine.begin() as conn:
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
        db.commit()


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
