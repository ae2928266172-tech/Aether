"""数据库连接。开发和测试用 SQLite，上线用 PostgreSQL（设置环境变量 DATABASE_URL）。"""
import os
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

CN_TZ = timezone(timedelta(hours=8))


def now() -> datetime:
    """业务时间统一用北京时间（不带时区存储）。"""
    return datetime.now(CN_TZ).replace(tzinfo=None, microsecond=0)


# 当前请求会不会写库（非 GET 请求）。SQLite 上写请求的事务一开始就拿写锁，见 make_engine。
writing: ContextVar[bool] = ContextVar("writing", default=True)


class Base(DeclarativeBase):
    pass


def make_engine(url: str | None = None):
    url = url or os.environ.get("DATABASE_URL") or "sqlite:///" + os.path.join(
        os.path.dirname(os.path.dirname(__file__)), "data", "shouyin.db")
    kwargs = {}
    if url.startswith("sqlite"):
        # timeout：另一台设备正在写库时最多等 30 秒，而不是立刻报“database is locked”
        kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30}
        if url.startswith("sqlite:///") and ":memory:" not in url:
            os.makedirs(os.path.dirname(url[len("sqlite:///"):]) or ".", exist_ok=True)
        else:
            from sqlalchemy.pool import StaticPool
            kwargs["poolclass"] = StaticPool
    engine = create_engine(url, **kwargs)
    if url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def _fk(dbapi_conn, _):
            # 关掉 Python sqlite3 自己的“遇到写语句才开事务”，事务由下面的 begin 显式开始
            dbapi_conn.isolation_level = None
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()

        @event.listens_for(engine, "begin")
        def _begin(conn):
            # SQLite 不支持 SELECT ... FOR UPDATE。写请求一开始就用 BEGIN IMMEDIATE 拿写锁，
            # 两台收银机同时退同一单、同时扣同一库存时排队执行，后一个读到的是前一个提交后的数据，
            # 不会出现“都以为还能退”而多退。读请求照常并发。
            conn.exec_driver_sql("BEGIN IMMEDIATE" if writing.get() else "BEGIN")
    return engine


engine = make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
