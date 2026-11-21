"""上线前的安全检查。

SHOUYIN_ENV=production 时，下面任何一条不满足，服务端拒绝启动并说明原因：
- 必须设 SHOUYIN_SECRET（至少 32 位随机字符），不能用本机自动生成的密钥文件
- 必须设 DATABASE_URL，不能用项目目录里的默认库
- 不能有账号还在用默认/弱密码（admin123、store123、123456 等，演示账号就是这些密码）
- 不能打开“网页版顾客免登录”（SHOUYIN_ENV=production 时本来就关闭）
其他环境只在启动日志里提醒。
"""
import logging
import os

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import User
from .security import verify_password

WEAK = ("admin123", "store123", "123456", "12345678", "password", "admin")
log = logging.getLogger("shouyin")


def is_production() -> bool:
    return os.environ.get("SHOUYIN_ENV", "").lower() == "production"


def web_login_allowed() -> bool:
    """没有小程序账号时，网页版用本机随机标识免注册登录。只在明确的试用 / 测试环境开放。"""
    return os.environ.get("SHOUYIN_ENV", "").lower() in ("dev", "test")


def weak_password(user: User) -> bool:
    return any(verify_password(pw, user.password_hash) for pw in WEAK)


def problems(db: Session, passwords: bool = True) -> list[str]:
    out = []
    if len(os.environ.get("SHOUYIN_SECRET", "")) < 32:
        out.append("没有设 SHOUYIN_SECRET（至少 32 位随机字符，可用 python -c \"import secrets;print(secrets.token_hex(32))\" 生成）")
    if not os.environ.get("DATABASE_URL"):
        out.append("没有设 DATABASE_URL")
    weak = [u.username for u in db.scalars(select(User).where(User.active.is_(True))) if weak_password(u)] if passwords else []
    if weak:
        out.append("这些账号还在用默认或过于简单的密码，请改密码或停用（演示账号请删除）：" + "、".join(weak))
    return out


def check(db: Session) -> None:
    # 逐个账号试弱密码比较慢（每次几十毫秒），只在正式环境启动时做；试用环境登录时会单独提醒
    found = problems(db, passwords=is_production())
    if not found:
        return
    if is_production():
        raise RuntimeError("正式环境安全检查没通过，服务端不启动：\n  - " + "\n  - ".join(found))
    for p in found:
        log.warning("上线前需处理：%s", p)
