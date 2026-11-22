#!/usr/bin/env bash
# 服务器自己拉取更新：每 3 分钟查一次 GitHub 上的 deploy 分支，有新提交就下载代码包，交给 shouyin-update
# （先备份数据库，新版本起不来自动退回旧版本）。上线 = 把要上线的提交推到 deploy 分支。
#
#   暂停自动更新：touch /etc/shouyin/autodeploy.pause（删掉这个文件恢复）
#   看记录：      journalctl -u shouyin-autodeploy -n 50
#   失败提醒：    /etc/shouyin/autodeploy.env 里写 ALERT_TO=收件邮箱（用服务器上已配好的 msmtp 发信）
#
# 同一个提交更新失败后不会反复重试；修好后推新的提交到 deploy 即可。
set -euo pipefail
REPO=${REPO:-ae2928266172-tech/Aether}
BRANCH=${BRANCH:-deploy}
STATE=${STATE:-/var/lib/shouyin/autodeploy}
PAUSE=${PAUSE:-/etc/shouyin/autodeploy.pause}
UPDATE=${UPDATE:-/usr/local/bin/shouyin-update}
API=${API:-https://api.github.com}
CODELOAD=${CODELOAD:-https://codeload.github.com}
[ -f /etc/shouyin/autodeploy.env ] && . /etc/shouyin/autodeploy.env
ALERT_TO=${ALERT_TO:-}

[ -e "$PAUSE" ] && { echo "自动更新已暂停（$PAUSE）"; exit 0; }
mkdir -p "$STATE"
exec 9>"$STATE/lock"
flock -n 9 || { echo "上一次更新还没结束"; exit 0; }

alert() {  # 只在失败时发信；没配收件人就只记日志
  [ -n "$ALERT_TO" ] && command -v msmtp >/dev/null || return 0
  printf 'To: %s\nSubject: =?UTF-8?B?%s?=\nContent-Type: text/plain; charset=UTF-8\n\n%s\n' \
    "$ALERT_TO" "$(printf '%s' "收银系统自动更新失败" | base64 -w0)" "$1" | msmtp "$ALERT_TO" || true
}

SHA=$(curl -fsS -m 20 -H 'Accept: application/vnd.github.sha' "$API/repos/$REPO/commits/$BRANCH" 2>/dev/null || true)
if ! [[ "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  SHA=$(timeout 30 git ls-remote "https://github.com/$REPO.git" "refs/heads/$BRANCH" 2>/dev/null | cut -f1 || true)
fi
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "查不到 $BRANCH 分支（网络不通或分支不存在），下次再试"; exit 0; }

[ "$SHA" = "$(cat "$STATE/deployed" 2>/dev/null || true)" ] && exit 0
[ "$SHA" = "$(cat "$STATE/failed" 2>/dev/null || true)" ] && exit 0

echo "发现新提交 ${SHA:0:7}，开始更新"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
if ! curl -fsSL -m 300 --retry 3 -o "$TMP/a.tgz" "$CODELOAD/$REPO/tar.gz/$SHA"; then
  echo "下载代码包失败，下次再试"; exit 0
fi
mkdir "$TMP/src" && tar -xzf "$TMP/a.tgz" -C "$TMP/src" --strip-components=1
echo "$SHA" > "$TMP/src/REVISION"
tar -czf "$TMP/src.tgz" -C "$TMP/src" .
if OUT=$("$UPDATE" "$TMP/src.tgz" 2>&1); then
  echo "$OUT"
  echo "$SHA" > "$STATE/deployed"; rm -f "$STATE/failed"
  echo "已更新到 ${SHA:0:7}"
else
  echo "$OUT"
  echo "$SHA" > "$STATE/failed"
  echo "更新到 ${SHA:0:7} 失败，已退回原版本"
  alert "更新到 ${SHA:0:7} 失败，服务器已自动退回原版本，收银不受影响。

$(echo "$OUT" | tail -n 40)"
  exit 1
fi
