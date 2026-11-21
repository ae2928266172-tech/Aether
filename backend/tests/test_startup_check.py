"""正式环境安全检查：缺配置、弱密码时拒绝启动；漏设环境变量时网页版免登录不打开。"""
import pytest

from app import startup_check as sc
from app.models import User
from app.security import hash_password


def test_production_refuses_weak_setup(client, monkeypatch):
    from app import db as dbmod
    monkeypatch.setenv("SHOUYIN_ENV", "production")
    monkeypatch.setenv("SHOUYIN_SECRET", "short")
    with dbmod.SessionLocal() as db:
        with pytest.raises(RuntimeError) as e:
            sc.check(db)
        msg = str(e.value)
        assert "SHOUYIN_SECRET" in msg and "admin" in msg
        # 配齐密钥、改掉 admin 密码后可以启动
        monkeypatch.setenv("SHOUYIN_SECRET", "x" * 64)
        u = db.query(User).filter_by(username="admin").one()
        u.password_hash = hash_password("Zq7#long-and-random")
        db.commit()
        sc.check(db)


def test_non_production_only_warns(client, monkeypatch, caplog):
    from app import db as dbmod
    monkeypatch.setenv("SHOUYIN_ENV", "dev")
    monkeypatch.delenv("SHOUYIN_SECRET")
    with dbmod.SessionLocal() as db:
        sc.check(db)
    assert "SHOUYIN_SECRET" in caplog.text


@pytest.mark.parametrize("env", ["", "production", "prod"])
def test_web_login_closed_unless_dev(client, monkeypatch, env):
    monkeypatch.setenv("SHOUYIN_ENV", env)
    r = client.post("/api/customer/login", json={"code": "abc"})
    assert r.status_code == 503


def test_login_flags_weak_password(client, admin, world):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}).json()
    assert r["weak_password"] is True
    admin.post("/api/auth/password", {"old_password": "admin123", "new_password": "Zq7#long-and-random"})
    r = client.post("/api/auth/login", json={"username": "admin", "password": "Zq7#long-and-random"}).json()
    assert r["weak_password"] is False
