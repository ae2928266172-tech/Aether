"""首次启动时建表并写入默认角色、管理员账号和中心仓库。"""
import os

from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import Base
from .models import Location, Role, User
from .security import PERMISSIONS, hash_password

STORE_PERMS = ["pos", "orders", "refund", "discount", "adjust_amount", "reprint", "stock_view"]


def init_db(engine, session_factory):
    Base.metadata.create_all(engine)
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
