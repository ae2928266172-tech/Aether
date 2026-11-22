#!/usr/bin/env bash
# 服务器自己拉取更新：每 3 分钟查一次 GitHub 上的 deploy 分支，有新提交就下载代码包，交给 shouyin-update
# （先备份数据库，新版本起不来自动退回旧版本）。上线 = 把要上线的提交推到 deploy 分支。
#
#   暂停自动更新：touch /etc/shouyin/autodeploy.pause（删掉这个文件恢复）
#   看记录：      journalctl -u shouyin-autodeploy -n 50
#   失败提醒：    /etc/shouyin/autodeploy.env 里写 ALERT_TO=收件邮箱（用服务器上已配好的 msmtp 发信）
#
# 同一个提交更新失败后不会反复重试；修好后推新的提交到 deploy 即可。
#
# 只上线测试通过的提交：先查 GitHub Actions 里「tests」这一项的结果，通过才更新；
# 测试没跑完就等下一轮，测试没通过就不上线并发信提醒（在 GitHub 上重新跑通过后会自动上线）。
# 万一 GitHub Actions 出故障又急着上线：/etc/shouyin/autodeploy.env 里写 REQUIRE_CI=0（用完删掉）。
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
REQUIRE_CI=${REQUIRE_CI:-1}
CI_CHECK=${CI_CHECK:-tests}
CI_WAIT_ALERT_MIN=${CI_WAIT_ALERT_MIN:-30}

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

if [ "$REQUIRE_CI" = 1 ]; then
  CI=$(curl -fsS -m 20 -H 'Accept: application/vnd.github+json' \
         "$API/repos/$REPO/commits/$SHA/check-runs?check_name=$CI_CHECK" 2>/dev/null | python3 -c '
import json, sys
runs = json.load(sys.stdin).get("check_runs") or []
if not runs:
    print("none")
else:
    # 同一个提交在任一分支上测试通过过就算通过（同样的代码）；否则看最后一次
    if any(r.get("conclusion") == "success" for r in runs):
        print("success")
    else:
        r = max(runs, key=lambda r: r["id"])
        print(r.get("conclusion") or r.get("status") or "none")
' 2>/dev/null || echo unknown)
  case "$CI" in
    success)
      rm -f "$STATE/ci-wait" "$STATE/ci-failed" ;;
    failure|timed_out|cancelled|action_required|startup_failure|stale)
      if [ "$SHA" != "$(cat "$STATE/ci-failed" 2>/dev/null || true)" ]; then
        echo "$SHA" > "$STATE/ci-failed"
        alert "提交 ${SHA:0:7} 的自动测试没通过（$CI），没有上线，线上还是原版本，收银不受影响。
https://github.com/$REPO/commit/$SHA"
      fi
      echo "提交 ${SHA:0:7} 测试没通过（$CI），不上线"
      exit 0 ;;
    *)
      # 测试还在跑（或查不到结果）：下一轮再看；等太久发一次提醒
      [ "$SHA" = "$(head -n1 "$STATE/ci-wait" 2>/dev/null || true)" ] || printf '%s\n%s\n' "$SHA" "$(date +%s)" > "$STATE/ci-wait"
      SINCE=$(sed -n 2p "$STATE/ci-wait"); ALERTED=$(sed -n 3p "$STATE/ci-wait")
      if [ -z "$ALERTED" ] && [ $(( $(date +%s) - ${SINCE:-0} )) -ge $(( CI_WAIT_ALERT_MIN * 60 )) ]; then
        echo alerted >> "$STATE/ci-wait"
        alert "提交 ${SHA:0:7} 等了 ${CI_WAIT_ALERT_MIN} 分钟还没有自动测试结果（$CI），暂未上线。
请到 GitHub Actions 看一下：https://github.com/$REPO/commit/$SHA"
      fi
      echo "提交 ${SHA:0:7} 等测试结果（$CI），下次再看"
      exit 0 ;;
  esac
fi

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
