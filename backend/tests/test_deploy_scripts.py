"""上云用的脚本：SQLite 整库搬 PostgreSQL（设 TEST_PG_URL 才跑）、上线前停用默认密码账号、服务器上改密码。"""
import os
import sys

import pytest
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(__file__)), "scripts"))
from app.models import Location, Role, Store, User  # noqa: E402
from app.security import hash_password, verify_password  # noqa: E402
from app.seed import init_db  # noqa: E402


def _users(db, *names_pw):
    role = db.scalar(select(Role).where(Role.is_admin.is_(False)))
    for n, pw in names_pw:
        db.add(User(username=n, password_hash=hash_password(pw), role_id=role.id))
    db.commit()


def test_prepare_production(client):
    import prepare_production as pp
    from app import db as dbmod
    with dbmod.SessionLocal() as db:
        _users(db, ("store1", "store123"), ("zhang", "Zhang-Long-Pw-7"))
        with pytest.raises(SystemExit):
            pp.prepare(db, None)  # admin 还是 admin123，又没给新密码：不改
        db.rollback()
        done = pp.prepare(db, "New-Admin-Pw-88")
        assert done == ["admin：已改密码", "store1：默认/简单密码，已停用"]
        by = {u.username: u for u in db.scalars(select(User))}
        assert verify_password("New-Admin-Pw-88", by["admin"].password_hash) and by["admin"].active
        assert not by["store1"].active and by["zhang"].active
        assert pp.prepare(db, None) == []


def test_set_password(client):
    import set_password as sp
    from app import db as dbmod
    with dbmod.SessionLocal() as db:
        _users(db, ("li", "store123"))
        u = db.scalar(select(User).where(User.username == "li"))
        u.active = False
        db.commit()
        sp.set_password(db, "li", "Li-New-Pw-123")
        db.refresh(u)
        assert u.active and verify_password("Li-New-Pw-123", u.password_hash) and u.token_version == 1
        with pytest.raises(SystemExit):
            sp.set_password(db, "nobody", "x" * 10)


@pytest.mark.skipif(not os.environ.get("TEST_PG_URL"), reason="没设 TEST_PG_URL")
def test_sqlite_to_pg(tmp_path):
    import sqlite_to_pg as m
    src_path = str(tmp_path / "old.db")
    src = create_engine("sqlite:///" + src_path)
    init_db(src, sessionmaker(bind=src))
    with sessionmaker(bind=src)() as db:
        _users(db, ("store1", "store123"))
    pg_url = os.environ["TEST_PG_URL"]
    base, name = pg_url.rsplit("/", 1)
    admin = create_engine(base + "/postgres", isolation_level="AUTOCOMMIT")
    with admin.connect() as c:
        c.execute(text("DROP DATABASE IF EXISTS shouyin_migrate_test"))
        c.execute(text("CREATE DATABASE shouyin_migrate_test"))
    dst_url = base + "/shouyin_migrate_test"
    try:
        counts = m.migrate(src_path, dst_url, log=lambda *_: None)
        assert counts["users"] == 2 and counts["roles"] == 2
        dst = create_engine(dst_url)
        with sessionmaker(bind=dst)() as db:
            # 布尔、时间等字段类型正确，自增编号接着往下走
            u = db.scalar(select(User).where(User.username == "store1"))
            assert u.active is True and u.created_at is not None
            loc = Location(name="新店", kind="store")
            db.add(loc)
            db.flush()
            assert loc.id > 1  # 搬过来的中心仓库是 1
            db.add(Store(name="新店", location_id=loc.id))
            db.commit()
            assert db.scalar(select(func.count()).select_from(Store)) == 1
        dst.dispose()
        with pytest.raises(m.MigrateError):  # 目标库已有数据：不覆盖
            m.migrate(src_path, dst_url, log=lambda *_: None)
    finally:
        with admin.connect() as c:
            c.execute(text("DROP DATABASE IF EXISTS shouyin_migrate_test WITH (FORCE)"))
