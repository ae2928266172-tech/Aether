"""从备份恢复数据库，或只做恢复演练。

演练（不动正在用的数据库）：python scripts/restore_db.py 备份文件或备份文件夹 --check
真正恢复：先停掉服务端，再运行 python scripts/restore_db.py 备份文件 --yes
  恢复前会把当前数据库另存为 shouyin.db.before-restore-时间，恢复错了可以拿它退回。
传文件夹时自动用里面最新的一份。
"""
import argparse
import os
import socket
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.backup import BackupError, check, db_path_from_env, resolve, restore, unpack  # noqa: E402


def port_busy(port: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def main(argv=None):
    ap = argparse.ArgumentParser(description="恢复收银系统数据库")
    ap.add_argument("backup", help="备份文件（.db.gz）或备份文件夹")
    ap.add_argument("--db", default=None, help="要恢复到的数据库，默认读 DATABASE_URL")
    ap.add_argument("--check", action="store_true", help="只演练：解压到临时位置检查，不替换")
    ap.add_argument("--yes", action="store_true", help="确认替换正在用的数据库")
    ap.add_argument("--port", type=int, default=8765, help="服务端端口，恢复前检查它已停止")
    a = ap.parse_args(argv)
    try:
        src = resolve(a.backup)
        if a.check:
            with tempfile.TemporaryDirectory() as d:
                counts = unpack(src, os.path.join(d, "drill.db"))
            print(f"演练通过：{src} 可以正常恢复")
            print("各表行数：", "，".join(f"{k} {v}" for k, v in counts.items()))
            target = a.db or db_path_from_env()
            if os.path.isfile(target):
                print("当前数据库：", "，".join(f"{k} {v}" for k, v in check(target).items()))
            return 0
        if not a.yes:
            print("这会替换正在用的数据库。确认要恢复请加 --yes；只想检查备份能不能用请加 --check")
            return 2
        if port_busy(a.port):
            print(f"服务端还在运行（端口 {a.port}），请先停掉再恢复")
            return 3
        r = restore(src, a.db or db_path_from_env())
    except (BackupError, OSError) as e:
        print("失败：", e)
        return 1
    print(f"已从 {r['from']} 恢复")
    print("各表行数：", "，".join(f"{k} {v}" for k, v in r["counts"].items()))
    if r["saved_old"]:
        print("原来的数据库另存在：", r["saved_old"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
