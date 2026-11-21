"""数据库备份与恢复。"""
import gzip
import os
import sqlite3
import threading
from datetime import datetime, timedelta

import pytest

from app.backup import BackupError, backup, check, list_backups, restore, unpack


def make_db(path, rows=3):
    con = sqlite3.connect(path)
    con.execute("CREATE TABLE orders (id INTEGER PRIMARY KEY, amount INTEGER)")
    con.executemany("INSERT INTO orders (amount) VALUES (?)", [(i * 100,) for i in range(rows)])
    con.commit(); con.close()


def count(path):
    con = sqlite3.connect(path)
    try:
        return con.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
    finally:
        con.close()


def test_backup_is_checked_compressed_and_restorable(tmp_path):
    db = tmp_path / "shouyin.db"; make_db(db, 5)
    media = tmp_path / "media"; (media / "_thumbs").mkdir(parents=True)
    (media / "a.jpg").write_bytes(b"img"); (media / "_thumbs" / "x.webp").write_bytes(b"t")
    r = backup(str(db), str(tmp_path / "bk"), media=str(media), copy_to=[str(tmp_path / "cloud")])
    assert r["counts"] == {"orders": 5}
    assert r["file"].endswith(".db.gz") and gzip.open(r["file"]).read(16).startswith(b"SQLite format 3")
    assert os.path.isfile(r["copies"][0])
    assert r["media_new"] == 1 and (tmp_path / "bk" / "media" / "a.jpg").exists()
    assert not (tmp_path / "bk" / "media" / "_thumbs").exists(), "缩略图不用备份"
    assert (tmp_path / "cloud" / "media" / "a.jpg").exists()
    assert not [f for f in os.listdir(tmp_path / "bk") if f.endswith(".tmp")]
    # 图片只复制新的
    assert backup(str(db), str(tmp_path / "bk"), media=str(media), stamp=datetime(2030, 1, 1))["media_new"] == 0
    # 改坏当前库，再从备份恢复，原库会另存一份
    con = sqlite3.connect(db); con.execute("DELETE FROM orders"); con.commit(); con.close()
    out = restore(str(tmp_path / "bk"), str(db))  # 传文件夹取最新一份
    assert count(db) == 5 and out["counts"] == {"orders": 5}
    assert count(out["saved_old"]) == 0


def test_backup_while_someone_is_writing(tmp_path):
    """收银进行中备份：备份里要么有、要么没有那笔没提交的单，不会拷到一半。"""
    db = tmp_path / "shouyin.db"; make_db(db, 2)
    writer = sqlite3.connect(db, timeout=30, check_same_thread=False)
    writer.execute("BEGIN IMMEDIATE"); writer.execute("INSERT INTO orders (amount) VALUES (1)")
    t = threading.Timer(0.5, writer.commit)
    t.start()
    r = backup(str(db), str(tmp_path / "bk"))
    t.join(); writer.close()
    assert r["counts"]["orders"] in (2, 3)


def test_keep_only_latest(tmp_path):
    db = tmp_path / "shouyin.db"; make_db(db)
    base = datetime(2026, 11, 1, 22, 30)
    for i in range(5):
        r = backup(str(db), str(tmp_path / "bk"), keep=3, stamp=base + timedelta(days=i))
    names = [os.path.basename(p) for p in list_backups(str(tmp_path / "bk"))]
    assert names == ["shouyin-20261103-223000.db.gz", "shouyin-20261104-223000.db.gz", "shouyin-20261105-223000.db.gz"]
    assert len(r["pruned"]) == 1


def test_broken_backup_never_replaces_db(tmp_path):
    db = tmp_path / "shouyin.db"; make_db(db, 4)
    bad = tmp_path / "shouyin-20261119-223000.db.gz"
    bad.write_bytes(gzip.compress(b"SQLite format 3\x00" + b"\x00" * 4000))
    with pytest.raises(BackupError):
        restore(str(bad), str(db))
    trunc = tmp_path / "t.db.gz"; trunc.write_bytes(gzip.compress(open(db, "rb").read())[:200])
    with pytest.raises(BackupError):
        unpack(str(trunc), str(tmp_path / "x.db"))
    assert count(db) == 4 and check(str(db)) == {"orders": 4}
    assert not [f for f in os.listdir(tmp_path) if "restore" in f or f.endswith(".tmp")]


def test_missing_db_errors(tmp_path):
    with pytest.raises(BackupError):
        backup(str(tmp_path / "nope.db"), str(tmp_path / "bk"))


def test_command_line_backup_drill_restore(tmp_path, capsys):
    """用真实的表结构跑一遍命令行：备份、演练、没加 --yes 不替换、加了才替换。"""
    import importlib.util
    from sqlalchemy import create_engine
    from app.db import Base
    from app import models  # noqa: F401  注册所有表
    db = tmp_path / "shouyin.db"
    eng = create_engine(f"sqlite:///{db}"); Base.metadata.create_all(eng)
    eng.dispose()

    def load(name):
        here = os.path.join(os.path.dirname(os.path.dirname(__file__)), "scripts", name + ".py")
        spec = importlib.util.spec_from_file_location(name, here); m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m); return m
    bk, rs = load("backup_db"), load("restore_db")
    assert bk.main(["--db", str(db), "--out", str(tmp_path / "bk"), "--copy-to", str(tmp_path / "cloud")]) == 0
    out = capsys.readouterr().out
    assert "备份完成" in out and "orders 0" in out and "已另存" in out
    assert rs.main([str(tmp_path / "bk"), "--db", str(db), "--check"]) == 0
    assert "演练通过" in capsys.readouterr().out
    before = os.path.getmtime(db)
    assert rs.main([str(tmp_path / "bk"), "--db", str(db)]) == 2  # 没加 --yes
    assert os.path.getmtime(db) == before
    assert rs.main([str(tmp_path / "cloud"), "--db", str(db), "--yes", "--port", "1"]) == 0
    assert "原来的数据库另存在" in capsys.readouterr().out
