#!/usr/bin/env bash
# 收银系统 云服务器一键安装（Ubuntu 22.04 / 24.04，root 运行）。可重复运行：已有的配置和数据不会被覆盖。
#
# 用法：bash install.sh 代码包.tar.gz [--sqlite 旧库.db] [--media 图片.tar.gz]
#   代码包：在仓库里 git archive --format=tar.gz -o shouyin-src.tar.gz HEAD
#   --sqlite：把本机试用的 SQLite 库整库搬进来（只在云端数据库还是空的时候搬）
#   --media：商品图片打包（tar.gz，包里直接是图片文件）
#
# 装好后：
#   代码   /opt/shouyin/current（每次更新一个新目录，current 指向正在用的版本）
#   配置   /etc/shouyin/shouyin.env（密钥、数据库密码，只有 root 和服务账号能读）
#   图片   /var/lib/shouyin/media
#   备份   /var/backups/shouyin（每天 23:30，保留 30 天）
#   日志   journalctl -u shouyin
#   初始 admin 密码  /root/shouyin-admin-初始密码.txt（登录后台改掉后删除这个文件）
set -euo pipefail

SRC_TGZ=""; SQLITE=""; MEDIA_TGZ=""
while [ $# -gt 0 ]; do
  case "$1" in
    --sqlite) SQLITE="$2"; shift 2 ;;
    --media) MEDIA_TGZ="$2"; shift 2 ;;
    *) SRC_TGZ="$1"; shift ;;
  esac
done
[ -n "$SRC_TGZ" ] && [ -f "$SRC_TGZ" ] || { echo "用法：bash install.sh 代码包.tar.gz [--sqlite 旧库.db] [--media 图片.tar.gz]"; exit 2; }
[ "$(id -u)" = 0 ] || { echo "请用 root 运行"; exit 2; }

APP=/opt/shouyin; ETC=/etc/shouyin; ENVF=$ETC/shouyin.env; DATA=/var/lib/shouyin; BK=/var/backups/shouyin
PIP_INDEX=${PIP_INDEX:-https://mirrors.aliyun.com/pypi/simple/}
say() { echo; echo "== $*"; }

say "1/8 安装系统软件（Python、PostgreSQL、Nginx）"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q python3 python3-venv python3-pip postgresql nginx curl >/dev/null
systemctl enable --now postgresql >/dev/null

# 2G 内存的小机器加 2G 交换空间，防止装依赖或高峰时内存不够被系统杀进程
if ! swapon --show | grep -q . && [ ! -f /swapfile ]; then
  say "加 2G 交换空间"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

say "2/8 服务账号和目录"
id shouyin >/dev/null 2>&1 || useradd --system --home-dir $APP --shell /usr/sbin/nologin shouyin
mkdir -p $APP/releases $ETC $DATA/media $BK
chown shouyin:shouyin $DATA $DATA/media
chown postgres:postgres $BK; chmod 750 $BK

say "3/8 解压代码"
REL=$APP/releases/$(date +%Y%m%d-%H%M%S)
mkdir -p "$REL" && tar -xzf "$SRC_TGZ" -C "$REL"
[ -f "$REL/backend/app/main.py" ] || { echo "代码包里没有 backend/app/main.py，包不对"; exit 1; }
chown -R root:root "$REL"

say "4/8 Python 依赖（用阿里云镜像）"
[ -x $APP/venv/bin/python ] || python3 -m venv $APP/venv
PYTHONUTF8=1 $APP/venv/bin/pip install -q -i "$PIP_INDEX" --upgrade pip >/dev/null
PYTHONUTF8=1 $APP/venv/bin/pip install -q -i "$PIP_INDEX" -r "$REL/backend/requirements.txt"

say "5/8 数据库和配置"
if [ ! -f $ENVF ]; then
  DBPW=$(python3 -c "import secrets;print(secrets.token_urlsafe(24))")
  SECRET=$(python3 -c "import secrets;print(secrets.token_hex(32))")
  su postgres -c "psql -qtAc \"SELECT 1 FROM pg_roles WHERE rolname='shouyin'\"" | grep -q 1 \
    || su postgres -c "psql -qc \"CREATE ROLE shouyin LOGIN PASSWORD '$DBPW'\""
  su postgres -c "psql -qc \"ALTER ROLE shouyin PASSWORD '$DBPW'\""
  su postgres -c "psql -qtAc \"SELECT 1 FROM pg_database WHERE datname='shouyin'\"" | grep -q 1 \
    || su postgres -c "createdb -O shouyin -E UTF8 shouyin"
  umask 077
  cat > $ENVF <<CONF
SHOUYIN_ENV=production
SHOUYIN_SECRET=$SECRET
DATABASE_URL=postgresql+psycopg://shouyin:$DBPW@127.0.0.1:5432/shouyin
SHOUYIN_MEDIA=$DATA/media
TZ=Asia/Shanghai
CONF
  umask 022
  chown root:shouyin $ENVF; chmod 640 $ENVF
  echo "已生成 $ENVF"
else
  echo "沿用已有 $ENVF"
fi
set -a; . $ENVF; set +a
PY=$APP/venv/bin/python
cd "$REL/backend"

EMPTY=$($PY -c "
from sqlalchemy import create_engine, inspect, text
e=create_engine('$DATABASE_URL'); t=inspect(e).get_table_names()
print(1 if 'users' not in t else 0 if e.connect().execute(text('select count(*) from users')).scalar() else 1)")

if [ -n "$SQLITE" ]; then
  if [ "$EMPTY" = 1 ]; then
    say "搬 SQLite 数据：$SQLITE"
    $PY scripts/sqlite_to_pg.py "$SQLITE" "$DATABASE_URL"
    EMPTY=0
  else
    echo "云端数据库已经有数据，不再搬 SQLite（防止覆盖）"
  fi
fi
if [ -n "$MEDIA_TGZ" ]; then
  say "解压商品图片"
  tar -xzf "$MEDIA_TGZ" -C $DATA/media --no-same-owner && chown -R shouyin:shouyin $DATA/media
  echo "图片 $(find $DATA/media -type f | wc -l) 个"
fi

say "6/8 建表、处理默认密码账号"
ADMIN_PW_FILE=/root/shouyin-admin-初始密码.txt
NEWPW=$(python3 -c "import secrets,string;a=string.ascii_letters+string.digits;print(''.join(secrets.choice(a) for _ in range(14)))")
# 正式环境有默认/简单密码的账号会拒绝启动：admin 换成随机密码，其他（演示账号 store1/store2 等）停用
NEED=$(SHOUYIN_ENV=dev SHOUYIN_ADMIN_PASSWORD=$NEWPW $PY -c "
import logging; logging.disable(logging.WARNING)
from app import db; from app.seed import init_db; init_db(db.engine, db.SessionLocal)
from app.startup_check import weak_password; from app.models import User
with db.SessionLocal() as s: print(1 if any(weak_password(u) for u in s.query(User).filter_by(username='admin', active=True)) else 0)")
FRESH_ADMIN=$($PY -c "
from app import db; from app.models import User; from app.security import verify_password
with db.SessionLocal() as s:
    u=s.query(User).filter_by(username='admin').first(); print(1 if u and verify_password('$NEWPW', u.password_hash) else 0)")
if [ "$NEED" = 1 ] || [ "$FRESH_ADMIN" = 1 ]; then
  umask 077; printf '后台 admin 初始密码：%s\n登录后台后右上角改密码，然后删除本文件：rm %s\n' "$NEWPW" "$ADMIN_PW_FILE" > "$ADMIN_PW_FILE"; umask 022
  echo "admin 设了随机密码，保存在 $ADMIN_PW_FILE（只有 root 能看）"
fi
SHOUYIN_ADMIN_PASSWORD=$NEWPW $PY scripts/prepare_production.py

say "7/8 开机自启服务、Nginx、每日备份"
ln -sfn "$REL" $APP/current
install -m 644 "$REL/deploy/shouyin.service" /etc/systemd/system/shouyin.service
install -m 644 "$REL/deploy/nginx-shouyin.conf" /etc/nginx/sites-available/shouyin
ln -sfn /etc/nginx/sites-available/shouyin /etc/nginx/sites-enabled/shouyin
rm -f /etc/nginx/sites-enabled/default
install -m 755 "$REL/deploy/backup_pg.sh" /usr/local/bin/shouyin-backup
install -m 755 "$REL/deploy/update.sh" /usr/local/bin/shouyin-update
cat > /usr/local/bin/shouyin-passwd <<'SH'
#!/bin/sh
# 给账号设新密码：shouyin-passwd admin
set -a; . /etc/shouyin/shouyin.env; set +a
cd /opt/shouyin/current/backend && exec /opt/shouyin/venv/bin/python scripts/set_password.py "$@"
SH
chmod 755 /usr/local/bin/shouyin-passwd
echo "30 23 * * * root /usr/local/bin/shouyin-backup >> /var/log/shouyin-backup.log 2>&1" > /etc/cron.d/shouyin-backup
timedatectl set-timezone Asia/Shanghai 2>/dev/null || true
systemctl daemon-reload
systemctl enable shouyin >/dev/null 2>&1
systemctl restart shouyin
nginx -t -q && systemctl enable nginx >/dev/null 2>&1 && systemctl reload nginx

say "8/8 检查"
for i in $(seq 1 30); do curl -fs http://127.0.0.1/api/health >/dev/null && break; sleep 1; done
if curl -fs http://127.0.0.1/api/health >/dev/null; then
  /usr/local/bin/shouyin-backup >/dev/null && echo "首次备份完成：$(ls -t $BK/*.dump | head -1)"
  IP=$(curl -fs --max-time 3 http://100.100.100.200/latest/meta-data/eipv4 || curl -fs --max-time 3 ifconfig.me || echo 服务器公网IP)
  echo; echo "安装完成。后台：http://$IP/web/admin/   门店收银：http://$IP/web/store/"
else
  echo "服务没起来，看日志：journalctl -u shouyin -n 50 --no-pager"; journalctl -u shouyin -n 30 --no-pager; exit 1
fi
