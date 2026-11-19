"""员工登录、账号、角色。"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import audit
from ..db import get_db
from ..models import Role, Store, User
from ..security import (PERMISSIONS, current_user, hash_password, make_token, require,
                        verify_password)
from ..serialize import user_out

router = APIRouter(prefix="/api", tags=["账号"])


class LoginIn(BaseModel):
    username: str
    password: str


# 登录失败限制：同一账号 10 分钟内错 5 次，锁 10 分钟（记在内存里，重启清零）
_FAILS: dict[str, list[float]] = {}
FAIL_LIMIT, FAIL_WINDOW = 5, 600


def _check_locked(name: str):
    import time
    recent = [t for t in _FAILS.get(name, []) if t > time.time() - FAIL_WINDOW]
    _FAILS[name] = recent
    if len(recent) >= FAIL_LIMIT:
        wait = int((recent[0] + FAIL_WINDOW - time.time()) // 60) + 1
        raise HTTPException(429, f"密码错误次数过多，请 {wait} 分钟后再试")


@router.post("/auth/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    import time
    name = body.username.strip().lower()
    _check_locked(name)
    u = db.scalar(select(User).where(User.username == body.username.strip()))
    if not u or not verify_password(body.password, u.password_hash):
        _FAILS.setdefault(name, []).append(time.time())
        raise HTTPException(400, "账号或密码错误")
    _FAILS.pop(name, None)
    if not u.active:
        raise HTTPException(400, "账号已停用")
    from ..startup_check import WEAK
    return {"token": make_token(str(u.id), "staff", u.token_version), "user": user_out(u),
            "weak_password": body.password in WEAK}


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
    audit.record(db, user, "账号", user.username, summary="修改了自己的密码")
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
    min_discount_rate: int = Field(1, ge=1, le=100)  # 最低折扣，80 = 最低 8 折；1 = 不限
    max_adjust_amount: int | None = Field(None, ge=0)  # 单笔最多调低（分），为空不限


def _role_out(r: Role):
    return {"id": r.id, "name": r.name, "is_admin": r.is_admin, "permissions": r.permissions or [],
            "min_discount_rate": r.min_discount_rate, "max_adjust_amount": r.max_adjust_amount}


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
def create_role(body: RoleIn, db: Session = Depends(get_db), me_: User = Depends(require("users"))):
    _check_role(body)
    if db.scalar(select(Role).where(Role.name == body.name)):
        raise HTTPException(400, "角色名已存在")
    r = Role(**body.model_dump())
    db.add(r)
    audit.record(db, me_, "角色权限", r.name, {}, audit.role_snap(r), summary="新增角色")
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
    before = audit.role_snap(r)
    for k, v in body.model_dump().items():
        setattr(r, k, v)
    audit.record(db, me_, "角色权限", r.name, before, audit.role_snap(r))
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
    min_discount_rate: int | None = Field(None, ge=1, le=100)  # 为空时用角色设置
    max_adjust_amount: int | None = Field(None, ge=0)


@router.get("/users")
def list_users(db: Session = Depends(get_db), _: User = Depends(require("users"))):
    return [user_out(u) for u in db.scalars(select(User).order_by(User.id))]


def _apply_user(db: Session, u: User, body: UserIn):
    if not db.get(Role, body.role_id):
        raise HTTPException(400, "角色不存在")
    u.username, u.display_name, u.role_id = body.username.strip(), body.display_name, body.role_id
    u.min_discount_rate, u.max_adjust_amount = body.min_discount_rate, body.max_adjust_amount
    stores = [db.get(Store, i) for i in body.store_ids]
    if any(s is None for s in stores):
        raise HTTPException(400, "门店不存在")
    u.stores = stores
    if u.active != body.active:
        u.token_version += 1
    u.active = body.active


@router.post("/users")
def create_user(body: UserIn, db: Session = Depends(get_db), me_: User = Depends(require("users"))):
    if not body.password or len(body.password) < 6:
        raise HTTPException(400, "密码至少 6 位")
    if db.scalar(select(User).where(User.username == body.username.strip())):
        raise HTTPException(400, "账号已存在")
    u = User(password_hash=hash_password(body.password), token_version=0, active=True)
    _apply_user(db, u, body)
    db.add(u)
    db.flush()
    db.refresh(u)
    audit.record(db, me_, "账号", u.username, {}, audit.user_snap(u), summary="新增账号")
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
    before = audit.user_snap(u)
    _apply_user(db, u, body)
    if body.password:
        if len(body.password) < 6:
            raise HTTPException(400, "密码至少 6 位")
        u.password_hash = hash_password(body.password)
        u.token_version += 1
    db.flush()
    db.refresh(u)
    audit.record(db, me_, "账号", u.username, before, audit.user_snap(u),
                 summary="重置了密码" if body.password else "")
    db.commit()
    db.refresh(u)
    return user_out(u)


# ---------------- 操作日志 ----------------

@router.get("/audit-logs")
def audit_logs(begin: str | None = None, end: str | None = None, action: str = "", keyword: str = "",
               user_id: int | None = None, page: int = 1, size: int = 50,
               db: Session = Depends(get_db), _: User = Depends(require("users"))):
    """谁在什么时候做了什么：改价、商品 / 库存品修改、角色权限、账号、门店设置、业务规则、库存单据、作废、退款。"""
    from datetime import date, datetime, time, timedelta
    from sqlalchemy import func, or_
    from ..models import AuditLog
    q = select(AuditLog)
    if begin:
        q = q.where(AuditLog.at >= datetime.combine(date.fromisoformat(begin), time.min))
    if end:
        q = q.where(AuditLog.at < datetime.combine(date.fromisoformat(end) + timedelta(days=1), time.min))
    if action:
        q = q.where(AuditLog.action == action)
    if user_id:
        q = q.where(AuditLog.user_id == user_id)
    if keyword.strip():
        k = keyword.strip()
        q = q.where(or_(AuditLog.target.contains(k), AuditLog.summary.contains(k), AuditLog.user_name.contains(k)))
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    size = max(1, min(size, 200))
    rows = db.scalars(q.order_by(AuditLog.id.desc()).offset((max(page, 1) - 1) * size).limit(size))
    actions = [a for (a,) in db.execute(select(AuditLog.action).distinct().order_by(AuditLog.action))]
    return {"total": total, "actions": actions, "rows": [
        {"id": r.id, "at": r.at.strftime("%Y-%m-%d %H:%M:%S"), "user_name": r.user_name, "action": r.action,
         "target": r.target, "summary": r.summary, "changes": r.changes or {}} for r in rows]}
