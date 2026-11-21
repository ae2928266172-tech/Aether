"""上线前处理还在用默认/简单密码的账号（正式环境有这种账号会拒绝启动）。

用法：SHOUYIN_ADMIN_PASSWORD=新密码 python scripts/prepare_production.py
- admin 如果还是默认/简单密码，改成 SHOUYIN_ADMIN_PASSWORD（没设就报错，不改）；
- 其他还在用默认/简单密码的账号（演示账号 store1、store2 等）一律停用，不删除，单据里的经手人照常显示；
  需要继续用的，管理员在后台给他改个密码再启用。
数据库读 DATABASE_URL。改密码和停用都会让该账号已登录的设备退出。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.models import User  # noqa: E402
from app.security import hash_password  # noqa: E402
from app.startup_check import weak_password  # noqa: E402


def prepare(db, admin_password: str | None) -> list[str]:
    done = []
    for u in db.scalars(select(User).where(User.active.is_(True)).order_by(User.id)):
        if not weak_password(u):
            continue
        if u.username == "admin":
            if not admin_password:
                raise SystemExit("admin 还是默认/简单密码，请设 SHOUYIN_ADMIN_PASSWORD 再运行")
            u.password_hash = hash_password(admin_password)
            done.append("admin：已改密码")
        else:
            u.active = False
            done.append(f"{u.username}：默认/简单密码，已停用")
        u.token_version = (u.token_version or 0) + 1
    db.commit()
    return done


def main():
    pw = os.environ.get("SHOUYIN_ADMIN_PASSWORD")
    if pw and len(pw) < 8:
        print("SHOUYIN_ADMIN_PASSWORD 至少 8 位")
        return 2
    with SessionLocal() as db:
        done = prepare(db, pw)
    print("\n".join(done) if done else "没有需要处理的账号")
    return 0


if __name__ == "__main__":
    sys.exit(main())
