"""把本机试用的 SQLite 数据库整库搬到 PostgreSQL（上云用）。

用法：python scripts/sqlite_to_pg.py C:/路径/shouyin.db postgresql+psycopg://用户:密码@主机:5432/库名

- 目标库必须是空的（没有表，或表里没有数据），不会覆盖已有数据；
- 按外键顺序逐表复制，两边都有的字段才复制（老库缺的字段用默认值）；
- 复制完把自增编号调到最大值之后，新单据编号接着往下走；
- 最后逐表核对行数，不一致就整体回滚、报错退出。
搬之前先停掉用这个 SQLite 库的服务端，或者先用 scripts/backup_db.py 拷一份再搬拷贝。
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, func, inspect, select, text  # noqa: E402

from app import models  # noqa: E402,F401  注册全部表
from app.db import Base  # noqa: E402

BATCH = 500


class MigrateError(Exception):
    pass


def migrate(sqlite_path: str, pg_url: str, log=print) -> dict:
    if not os.path.isfile(sqlite_path):
        raise MigrateError(f"找不到 SQLite 数据库：{sqlite_path}")
    src = create_engine("sqlite:///" + sqlite_path.replace("\\", "/"))
    dst = create_engine(pg_url)
    src_tables = set(inspect(src).get_table_names())
    Base.metadata.create_all(dst)
    counts = {}
    with src.connect() as s, dst.begin() as d:
        for t in Base.metadata.sorted_tables:
            if d.scalar(select(func.count()).select_from(t)):
                raise MigrateError(f"目标库的 {t.name} 表里已经有数据，为防止覆盖，停止搬迁")
        extra = src_tables - {t.name for t in Base.metadata.sorted_tables}
        if extra:
            log("这些表在新版本里没有，跳过：" + "、".join(sorted(extra)))
        for t in Base.metadata.sorted_tables:
            if t.name not in src_tables:
                counts[t.name] = 0
                continue
            have = {c["name"] for c in inspect(src).get_columns(t.name)}
            cols = [c for c in t.columns if c.name in have]
            missing = [c.name for c in t.columns if c.name not in have]
            if missing:
                log(f"{t.name}：老库没有字段 {', '.join(missing)}，用默认值")
            n = 0
            rows = s.execute(select(*cols)).mappings()
            while True:
                chunk = rows.fetchmany(BATCH)
                if not chunk:
                    break
                d.execute(t.insert(), [dict(r) for r in chunk])
                n += len(chunk)
            counts[t.name] = n
            # 自增主键：编号接着最大值往下走
            pk = list(t.primary_key.columns)
            if len(pk) == 1 and pk[0].autoincrement in (True, "auto") and str(pk[0].type) in ("INTEGER", "BIGINT"):
                seq = d.scalar(text("SELECT pg_get_serial_sequence(:t, :c)"), {"t": t.name, "c": pk[0].name})
                if seq:
                    d.execute(text(f'SELECT setval(:s, COALESCE((SELECT MAX("{pk[0].name}") FROM "{t.name}"), 1), '
                                   f'(SELECT MAX("{pk[0].name}") FROM "{t.name}") IS NOT NULL)'), {"s": seq})
        for t in Base.metadata.sorted_tables:
            got = d.scalar(select(func.count()).select_from(t))
            if got != counts[t.name]:
                raise MigrateError(f"{t.name} 行数不一致：SQLite {counts[t.name]}，PostgreSQL {got}")
    return counts


def main(argv=None):
    ap = argparse.ArgumentParser(description="SQLite 整库搬到 PostgreSQL")
    ap.add_argument("sqlite")
    ap.add_argument("pg_url", nargs="?", default=os.environ.get("DATABASE_URL"))
    a = ap.parse_args(argv)
    if not a.pg_url or not a.pg_url.startswith("postgresql"):
        print("请给出 PostgreSQL 地址（或设 DATABASE_URL）")
        return 2
    try:
        counts = migrate(a.sqlite, a.pg_url)
    except MigrateError as e:
        print("搬迁失败（目标库没有写入）：", e)
        return 1
    keys = ("stores", "users", "products", "skus", "stock_items", "orders", "payments", "refunds", "stock_docs", "shifts")
    print("搬迁完成：" + "，".join(f"{k} {counts[k]}" for k in keys if k in counts))
    print(f"共 {len(counts)} 张表，{sum(counts.values())} 行，逐表核对一致")
    return 0


if __name__ == "__main__":
    sys.exit(main())
