"""在服务器上给账号设新密码（忘记 admin 密码时用）。

用法：python scripts/set_password.py admin      然后按提示输入两次新密码（输入时不显示）
数据库读 DATABASE_URL。会同时启用该账号，并让它已登录的设备退出。
"""
import getpass
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.models import User  # noqa: E402
from app.security import hash_password  # noqa: E402
from app.startup_check import WEAK  # noqa: E402


def set_password(db, username: str, pw: str) -> None:
    u = db.scalar(select(User).where(User.username == username))
    if not u:
        raise SystemExit(f"没有账号 {username}")
    u.password_hash = hash_password(pw)
    u.active = True
    u.token_version = (u.token_version or 0) + 1
    db.commit()


def main(argv=None):
    argv = argv if argv is not None else sys.argv[1:]
    if len(argv) != 1:
        print(__doc__)
        return 2
    pw = getpass.getpass("新密码（至少 8 位）：")
    if len(pw) < 8 or pw in WEAK:
        print("密码太短或太简单，没有修改")
        return 1
    if getpass.getpass("再输一次：") != pw:
        print("两次不一样，没有修改")
        return 1
    with SessionLocal() as db:
        set_password(db, argv[0], pw)
    print(f"{argv[0]} 的密码已修改")
    return 0


if __name__ == "__main__":
    sys.exit(main())
