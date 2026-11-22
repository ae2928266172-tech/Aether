#!/usr/bin/env bash
# 更新服务端：shouyin-update 新代码包.tar.gz
# 先备份数据库，装新版本，起不来自动退回旧版本。
set -euo pipefail
TGZ=${1:?用法：shouyin-update 新代码包.tar.gz}
APP=/opt/shouyin; PIP_INDEX=${PIP_INDEX:-https://mirrors.aliyun.com/pypi/simple/}
OLD=$(readlink -f $APP/current)
/usr/local/bin/shouyin-backup
REL=$APP/releases/$(date +%Y%m%d-%H%M%S)
mkdir -p "$REL" && tar -xzf "$TGZ" -C "$REL" && chown -R root:root "$REL"
[ -f "$REL/backend/app/main.py" ] || { echo "代码包不对"; rm -rf "$REL"; exit 1; }
PYTHONUTF8=1 $APP/venv/bin/pip install -q -i "$PIP_INDEX" -r "$REL/backend/requirements.txt"
install -m 755 "$REL/deploy/backup_pg.sh" /usr/local/bin/shouyin-backup
ln -sfn "$REL" $APP/current
systemctl restart shouyin
for i in $(seq 1 30); do curl -fs http://127.0.0.1:8000/api/health >/dev/null && break; sleep 1; done
if curl -fs http://127.0.0.1:8000/api/health >/dev/null; then
  echo "更新完成：$REL"
  ls -1dt $APP/releases/* | tail -n +6 | xargs -r rm -rf   # 留最近 5 个版本
else
  echo "新版本起不来，退回 $OLD"; journalctl -u shouyin -n 30 --no-pager
  ln -sfn "$OLD" $APP/current; systemctl restart shouyin; exit 1
fi
