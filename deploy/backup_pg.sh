#!/usr/bin/env bash
# 每日备份：PostgreSQL 整库（pg_dump 自定义格式，可单表恢复）+ 商品图片增量复制。保留最近 30 份。
# 恢复：pg_restore --clean --if-exists -d shouyin 备份文件.dump（先 systemctl stop shouyin）
set -euo pipefail
BK=/var/backups/shouyin; KEEP=${KEEP:-30}
F=$BK/shouyin-$(date +%Y%m%d-%H%M%S).dump
su postgres -c "pg_dump -Fc -d shouyin -f '$F.part'"
mv "$F.part" "$F"
su postgres -c "pg_restore -l '$F' >/dev/null"   # 能列出目录才算备份完好
mkdir -p $BK/media && cp -rn /var/lib/shouyin/media/. $BK/media/ 2>/dev/null || true
ls -1t $BK/shouyin-*.dump | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "$(date '+%F %T') 备份完成 $F $(du -h "$F" | cut -f1)"
