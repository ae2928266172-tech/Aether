"""数据库备份与恢复（SQLite）。

备份：用 SQLite 自带的在线备份接口拷一份，收银照常进行也不会拷到写了一半的数据；拷完先做完整性检查，再压缩成
shouyin-年月日-时分秒.db.gz，只保留最近若干份。商品图片按文件名增量复制（图片文件名是随机的、不会被改写）。
恢复：先解压到临时文件并检查，确认是好的才替换；替换前把当前数据库另存一份，恢复错了还能退回。

这个文件不依赖网页服务本身，服务没启动也能用。命令行入口见 scripts/backup_db.py 和 scripts/restore_db.py。
"""
import glob
import gzip
import os
import re
import shutil
import sqlite3
from datetime import datetime

PREFIX = "shouyin-"
PATTERN = re.compile(r"^shouyin-\d{8}-\d{6}\.db\.gz$")
# 恢复演练时报告的几张主要表（表不存在就跳过）
KEY_TABLES = ("stores", "users", "products", "skus", "stock_items", "stock_balances", "orders", "order_items", "payments", "refunds", "stock_docs", "shifts")


class BackupError(Exception):
    pass


def db_path_from_env() -> str:
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "shouyin.db")
    if not url.startswith("sqlite:///"):
        raise BackupError("这个脚本只能备份 SQLite 数据库；PostgreSQL 请用 pg_dump")
    return os.path.normpath(url[len("sqlite:///"):])


def _move(src: str, dst: str) -> None:
    try:
        os.replace(src, dst)
    except OSError:
        # AppData 被系统重定向的电脑上同目录改名也可能报 WinError 17，改用复制再删
        if os.path.exists(dst):
            os.remove(dst)
        shutil.move(src, dst)


def _snapshot(db: str, dest: str) -> None:
    """把数据库完整另存一份。数据库是 WAL 模式时，最近的改动可能还在 -wal 文件里，直接复制主文件会漏掉，
    所以用 SQLite 的备份接口拷；打不开（文件已坏）时退回直接复制。"""
    try:
        src = sqlite3.connect(db, timeout=30)
        dst = sqlite3.connect(dest)
        try:
            src.backup(dst)
            dst.execute("PRAGMA journal_mode=DELETE")
        finally:
            dst.close(); src.close()
    except sqlite3.Error:
        shutil.copyfile(db, dest)


def check(path: str) -> dict:
    """完整性检查，返回主要表的行数。坏库抛 BackupError。"""
    try:
        con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    except sqlite3.Error as e:
        raise BackupError(f"打不开数据库：{e}") from e
    try:
        res = con.execute("PRAGMA integrity_check").fetchall()
        if res != [("ok",)]:
            raise BackupError("完整性检查没通过：" + "; ".join(r[0] for r in res[:5]))
        names = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if not names:
            raise BackupError("数据库里一张表都没有")
        return {t: con.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0] for t in KEY_TABLES if t in names}
    except sqlite3.DatabaseError as e:
        raise BackupError(f"不是有效的数据库文件：{e}") from e
    finally:
        con.close()


def list_backups(folder: str) -> list[str]:
    """按时间从旧到新。"""
    return sorted(p for p in glob.glob(os.path.join(folder, PREFIX + "*.db.gz")) if PATTERN.match(os.path.basename(p)))


def backup(db: str, out_dir: str, keep: int = 30, media: str | None = None,
           copy_to: list[str] | None = None, stamp: datetime | None = None) -> dict:
    if not os.path.isfile(db):
        raise BackupError(f"找不到数据库：{db}")
    os.makedirs(out_dir, exist_ok=True)
    name = PREFIX + (stamp or datetime.now()).strftime("%Y%m%d-%H%M%S") + ".db.gz"
    final = os.path.join(out_dir, name)
    raw = final + ".raw.tmp"
    gz = final + ".tmp"
    try:
        src = sqlite3.connect(db, timeout=30)
        dst = sqlite3.connect(raw)
        try:
            src.backup(dst)
            dst.execute("PRAGMA journal_mode=DELETE")  # 备份文件本身做成单文件模式，不带 -wal/-shm
        finally:
            dst.close(); src.close()
        counts = check(raw)
        with open(raw, "rb") as f, gzip.open(gz, "wb", compresslevel=6) as g:
            shutil.copyfileobj(f, g, 1 << 20)
        _move(gz, final)
    finally:
        for t in (raw, gz):
            if os.path.exists(t):
                os.remove(t)
    pruned = prune(out_dir, keep)
    result = {"file": final, "bytes": os.path.getsize(final), "counts": counts, "pruned": pruned, "copies": [], "media_new": 0}
    if media and os.path.isdir(media):
        result["media_new"] = sync_media(media, os.path.join(out_dir, "media"))
    for extra in copy_to or []:
        os.makedirs(extra, exist_ok=True)
        tmp = os.path.join(extra, name + ".tmp")
        shutil.copyfile(final, tmp)
        _move(tmp, os.path.join(extra, name))
        prune(extra, keep)
        if media and os.path.isdir(media):
            sync_media(media, os.path.join(extra, "media"))
        result["copies"].append(os.path.join(extra, name))
    return result


def prune(folder: str, keep: int) -> list[str]:
    old = list_backups(folder)[:-keep] if keep > 0 else []
    for p in old:
        os.remove(p)
    return old


def sync_media(src: str, dst: str) -> int:
    """只复制新图片（不含缩略图，缩略图随时能重新生成）。"""
    os.makedirs(dst, exist_ok=True)
    n = 0
    for name in os.listdir(src):
        s = os.path.join(src, name)
        if name.startswith("_") or not os.path.isfile(s):
            continue
        d = os.path.join(dst, name)
        if os.path.exists(d) and os.path.getsize(d) == os.path.getsize(s):
            continue
        shutil.copyfile(s, d + ".tmp")
        _move(d + ".tmp", d)
        n += 1
    return n


def resolve(backup_file: str) -> str:
    """传文件夹就取里面最新的一份。"""
    if os.path.isdir(backup_file):
        found = list_backups(backup_file)
        if not found:
            raise BackupError(f"{backup_file} 里没有备份文件")
        return found[-1]
    if not os.path.isfile(backup_file):
        raise BackupError(f"找不到备份文件：{backup_file}")
    return backup_file


def unpack(backup_file: str, dest: str) -> dict:
    """解压到 dest 并检查，返回各表行数。"""
    tmp = dest + ".tmp"
    try:
        if backup_file.endswith(".gz"):
            with gzip.open(backup_file, "rb") as g, open(tmp, "wb") as f:
                shutil.copyfileobj(g, f, 1 << 20)
        else:
            shutil.copyfile(backup_file, tmp)
        counts = check(tmp)
        _move(tmp, dest)
        return counts
    except (OSError, EOFError, gzip.BadGzipFile) as e:
        raise BackupError(f"备份文件损坏，解压失败：{e}") from e
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def restore(backup_file: str, target: str) -> dict:
    """用备份替换 target。替换前把 target 另存为 target.before-restore-时间。"""
    backup_file = resolve(backup_file)
    staged = target + ".restore.tmp"
    counts = unpack(backup_file, staged)
    saved = None
    if os.path.exists(target):
        saved = target + ".before-restore-" + datetime.now().strftime("%Y%m%d-%H%M%S")
        _snapshot(target, saved)
    for side in ("-wal", "-shm", "-journal"):  # 旧库的日志文件不能留给新库用
        if os.path.exists(target + side):
            os.remove(target + side)
    _move(staged, target)
    return {"from": backup_file, "counts": counts, "saved_old": saved}
