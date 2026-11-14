"""员工登录、账号、角色。"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Role, Store, User
from ..security import (PERMISSIONS, current_user, hash_password, make_token, require,
                        verify_password)
from ..serialize import user_out

router = APIRouter(prefix="/api", tags=["账号"])


class LoginIn(BaseModel):
    username: str
    password: str


@router.post("/auth/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    u = db.scalar(select(User).where(User.username == body.username.strip()))
    if not u or not verify_password(body.password, u.password_hash):
        raise HTTPException(400, "账号或密码错误")
    if not u.active:
        raise HTTPException(400, "账号已停用")
    return {"token": make_token(str(u.id), "staff", u.token_version), "user": user_out(u)}


@router.get("/auth/me")
def me(user: User = Depends(current_user)):
    return user_out(user)


class PasswordIn(BaseModel):
    old_password: str
    new_password: str = Field(min_length=6)


@router.post("/auth/password")
def change_password(body: PasswordIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not verify_password(body.old_password, user.password_hash):
        raise HTTPException(400, "原密码错误")
    user = db.get(User, user.id)
    user.password_hash = hash_password(body.new_password)
    user.token_version += 1
    db.commit()
    return {"token": make_token(str(user.id), "staff", user.token_version)}


@router.get("/permissions")
def permissions(_: User = Depends(current_user)):
    return [{"key": k, "label": v} for k, v in PERMISSIONS.items()]


# ---------------- 角色 ----------------

class RoleIn(BaseModel):
    name: str
    is_admin: bool = False
    permissions: list[str] = []


def _role_out(r: Role):
    return {"id": r.id, "name": r.name, "is_admin": r.is_admin, "permissions": r.permissions or []}


@router.get("/roles")
def list_roles(db: Session = Depends(get_db), _: User = Depends(require("users"))):
    return [_role_out(r) for r in db.scalars(select(Role).order_by(Role.id))]


def _check_role(body: RoleIn):
    bad = [p for p in body.permissions if p not in PERMISSIONS]
    if bad:
        raise HTTPException(400, "未知权限：" + ",".join(bad))
    from ..security import ADMIN_ONLY
    if not body.is_admin and set(body.permissions) & ADMIN_ONLY:
        raise HTTPException(400, "门店角色不能勾选后台权限（商品、库存、门店、账号、小票设置、营收报表）")


@router.post("/roles")
def create_role(body: RoleIn, db: Session = Depends(get_db), _: User = Depends(require("users"))):
    _check_role(body)
    if db.scalar(select(Role).where(Role.name == body.name)):
        raise HTTPException(400, "角色名已存在")
    r = Role(name=body.name, is_admin=body.is_admin, permissions=body.permissions)
    db.add(r)
    db.commit()
    return _role_out(r)


@router.put("/roles/{rid}")
def update_role(rid: int, body: RoleIn, db: Session = Depends(get_db), me_: User = Depends(require("users"))):
    _check_role(body)
    r = db.get(Role, rid)
    if not r:
        raise HTTPException(404, "角色不存在")
    if r.id == me_.role_id and "users" not in body.permissions:
        raise HTTPException(400, "不能去掉自己角色的账号管理权限")
    r.name, r.is_admin, r.permissions = body.name, body.is_admin, list(body.permissions)
    db.commit()
    return _role_out(r)


# ---------------- 账号 ----------------

class UserIn(BaseModel):
    username: str
    display_name: str = ""
    role_id: int
    store_ids: list[int] = []
    active: bool = True
    password: str | None = None


@router.get("/users")
def list_users(db: Session = Depends(get_db), _: User = Depends(require("users"))):
    return [user_out(u) for u in db.scalars(select(User).order_by(User.id))]


def _apply_user(db: Session, u: User, body: UserIn):
    if not db.get(Role, body.role_id):
        raise HTTPException(400, "角色不存在")
    u.username, u.display_name, u.role_id = body.username.strip(), body.display_name, body.role_id
    stores = [db.get(Store, i) for i in body.store_ids]
    if any(s is None for s in stores):
        raise HTTPException(400, "门店不存在")
    u.stores = stores
    if u.active != body.active:
        u.token_version += 1
    u.active = body.active


@router.post("/users")
def create_user(body: UserIn, db: Session = Depends(get_db), _: User = Depends(require("users"))):
    if not body.password or len(body.password) < 6:
        raise HTTPException(400, "密码至少 6 位")
    if db.scalar(select(User).where(User.username == body.username.strip())):
        raise HTTPException(400, "账号已存在")
    u = User(password_hash=hash_password(body.password), token_version=0, active=True)
    _apply_user(db, u, body)
    db.add(u)
    db.commit()
    db.refresh(u)
    return user_out(u)


@router.put("/users/{uid}")
def update_user(uid: int, body: UserIn, db: Session = Depends(get_db), me_: User = Depends(require("users"))):
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "账号不存在")
    if u.id == me_.id and not body.active:
        raise HTTPException(400, "不能停用自己")
    dup = db.scalar(select(User).where(User.username == body.username.strip(), User.id != uid))
    if dup:
        raise HTTPException(400, "账号已存在")
    _apply_user(db, u, body)
    if body.password:
        if len(body.password) < 6:
            raise HTTPException(400, "密码至少 6 位")
        u.password_hash = hash_password(body.password)
        u.token_version += 1
    db.commit()
    db.refresh(u)
    return user_out(u)
