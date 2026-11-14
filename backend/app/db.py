"""数据库连接。开发和测试用 SQLite，上线用 PostgreSQL（设置环境变量 DATABASE_URL）。"""
import os
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

CN_TZ = timezone(timedelta(hours=8))


def now() -> datetime:
    """业务时间统一用北京时间（不带时区存储）。"""
    return datetime.now(CN_TZ).replace(tzinfo=None, microsecond=0)


class Base(DeclarativeBase):
    pass


def make_engine(url: str | None = None):
    url = url or os.environ.get("DATABASE_URL") or "sqlite:///" + os.path.join(
        os.path.dirname(os.path.dirname(__file__)), "data", "shouyin.db")
    kwargs = {}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
        if url.startswith("sqlite:///") and ":memory:" not in url:
            os.makedirs(os.path.dirname(url[len("sqlite:///"):]) or ".", exist_ok=True)
        else:
            from sqlalchemy.pool import StaticPool
            kwargs["poolclass"] = StaticPool
    engine = create_engine(url, **kwargs)
    if url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def _fk(dbapi_conn, _):
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()
    return engine


engine = make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
