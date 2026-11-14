"""登录、密码和权限。"""
import base64
import hashlib
import hmac
import os
import secrets
import time

import jwt
from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from .db import get_db
from .models import Customer, Store, User

# 权限点。后台角色和门店角色都从这里勾选。
PERMISSIONS = {
    # 后台
    "catalog": "商品、分类、供应商、库存品资料",
    "inventory": "仓库与门店库存：入库、出库、调拨、盘点、台账",
    "stores": "门店、区域与二维码",
    "users": "账号与角色权限",
    "receipt_config": "小票设置",
    "reports": "营收业绩与销售报表",
    # 门店
    "pos": "门店收银",
    "orders": "订单处理：接单、收款、取消",
    "refund": "退货退款",
    "discount": "打折",
    "adjust_amount": "调低本次应收 / 抹零",
    "reprint": "补打小票",
    "stock_view": "查看本店库存（还需门店设置允许）",
    "stock_edit": "修改本店库存（还需门店设置允许）",
}
ADMIN_ONLY = {"catalog", "inventory", "stores", "users", "receipt_config", "reports"}


def _secret() -> str:
    s = os.environ.get("SHOUYIN_SECRET")
    if s:
        return s
    # 登录签名密钥放在本机用户目录，不放项目文件夹（项目在 OneDrive 里，会被同步到云端）
    base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    path = os.path.join(base, "shouyin", "secret.key")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if not os.path.exists(path):
        with open(path, "w") as f:
            f.write(secrets.token_hex(32))
    with open(path) as f:
        return f.read().strip()


SECRET = _secret()
TOKEN_HOURS = 12


def hash_password(pw: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, 200_000)
    return "pbkdf2$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(dk).decode()


def verify_password(pw: str, stored: str) -> bool:
    try:
        _, salt_b, dk_b = stored.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), base64.b64decode(salt_b), 200_000)
        return hmac.compare_digest(dk, base64.b64decode(dk_b))
    except Exception:
        return False


def make_token(sub: str, kind: str, version: int = 0, hours: int = TOKEN_HOURS) -> str:
    payload = {"sub": sub, "kind": kind, "v": version, "exp": int(time.time()) + hours * 3600}
    return jwt.encode(payload, SECRET, algorithm="HS256")


def _decode(authorization: str | None) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "请先登录")
    try:
        return jwt.decode(authorization[7:], SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "登录已过期，请重新登录")
    except jwt.PyJWTError:
        raise HTTPException(401, "登录无效，请重新登录")


def current_user(authorization: str | None = Header(None), db: Session = Depends(get_db)) -> User:
    p = _decode(authorization)
    if p.get("kind") != "staff":
        raise HTTPException(401, "请使用员工账号登录")
    user = db.get(User, int(p["sub"]))
    if not user or not user.active or user.token_version != p.get("v"):
        raise HTTPException(401, "账号已停用或密码已修改，请重新登录")
    return user


def current_customer(authorization: str | None = Header(None), db: Session = Depends(get_db)) -> Customer:
    p = _decode(authorization)
    if p.get("kind") != "customer":
        raise HTTPException(401, "请从小程序进入")
    c = db.get(Customer, int(p["sub"]))
    if not c:
        raise HTTPException(401, "请重新进入小程序")
    return c


def has_perm(user: User, perm: str) -> bool:
    return perm in (user.role.permissions or [])


def require(*perms: str):
    """要求同时具备这些权限。"""
    def dep(user: User = Depends(current_user)) -> User:
        missing = [p for p in perms if not has_perm(user, p)]
        if missing:
            raise HTTPException(403, "没有权限：" + "、".join(PERMISSIONS.get(p, p) for p in missing))
        return user
    return dep


def check_store_access(user: User, store_id: int) -> None:
    """后台角色可访问所有门店；门店员工只能访问绑定的门店。"""
    if user.role.is_admin:
        return
    if store_id not in {s.id for s in user.stores}:
        raise HTTPException(403, "你没有这个门店的权限")


def store_stock_access(db: Session, user: User, store_id: int, edit: bool = False) -> Store:
    """门店员工看 / 改本店库存，需要账号权限且门店设置允许；后台库存权限不受门店设置限制。"""
    store = db.get(Store, store_id)
    if not store:
        raise HTTPException(404, "门店不存在")
    if has_perm(user, "inventory"):
        return store
    check_store_access(user, store_id)
    if edit:
        if not (has_perm(user, "stock_edit") and store.staff_can_edit_stock):
            raise HTTPException(403, "后台未允许本店修改库存")
    else:
        if not (has_perm(user, "stock_view") and store.staff_can_view_stock):
            raise HTTPException(403, "后台未允许本店查看库存")
    return store
