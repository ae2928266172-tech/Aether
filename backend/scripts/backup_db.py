"""备份数据库（收银照常进行时也可以备份）。

用法：python scripts/backup_db.py [--out 备份文件夹] [--keep 30] [--copy-to 另一个文件夹 ...]
数据库位置读环境变量 DATABASE_URL，图片位置读 SHOUYIN_MEDIA（和 start.ps1 一样）。
Windows 上一般不直接运行它，而是用仓库根目录的 backup.ps1 / install_backup_task.ps1。
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.backup import BackupError, backup, db_path_from_env  # noqa: E402


def main(argv=None):
    db = db_path_from_env()
    ap = argparse.ArgumentParser(description="备份收银系统数据库")
    ap.add_argument("--db", default=db)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(db), "backups"))
    ap.add_argument("--keep", type=int, default=30, help="每个文件夹保留最近几份（默认 30）")
    ap.add_argument("--media", default=os.environ.get("SHOUYIN_MEDIA"))
    ap.add_argument("--copy-to", action="append", default=[], help="再复制一份到这个文件夹（可写多次）")
    a = ap.parse_args(argv)
    try:
        r = backup(a.db, a.out, keep=a.keep, media=a.media, copy_to=a.copy_to)
    except (BackupError, OSError) as e:
        print("备份失败：", e)
        return 1
    print(f"备份完成：{r['file']}（{r['bytes'] // 1024} KB）")
    print("各表行数：", "，".join(f"{k} {v}" for k, v in r["counts"].items()))
    for c in r["copies"]:
        print("已另存：", c)
    if r["media_new"]:
        print(f"新复制图片 {r['media_new']} 张")
    if r["pruned"]:
        print(f"删掉了 {len(r['pruned'])} 份旧备份")
    return 0


if __name__ == "__main__":
    sys.exit(main())
