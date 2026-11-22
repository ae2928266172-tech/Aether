# 云服务器部署（Ubuntu 22.04 / 24.04）

## 第一次安装

在放代码的电脑上打包，连同旧数据一起传到服务器，再运行安装脚本：

```bash
git archive --format=tar.gz -o shouyin-src.tar.gz HEAD
# 需要搬本机数据时：先停掉本机服务端，再打包图片
tar -czf media.tar.gz -C %LOCALAPPDATA%/shouyin/media .
scp shouyin-src.tar.gz media.tar.gz shouyin.db root@服务器:/root/
ssh root@服务器 "mkdir -p /root/shouyin-src && tar -xzf shouyin-src.tar.gz -C /root/shouyin-src && \
  bash /root/shouyin-src/deploy/install.sh /root/shouyin-src.tar.gz --sqlite /root/shouyin.db --media /root/media.tar.gz"
```

安装脚本做的事：装 Python / PostgreSQL / Nginx，2G 内存的机器加 2G 交换空间，建服务账号和数据库（随机密码），
生成 `/etc/shouyin/shouyin.env`（`SHOUYIN_ENV=production`、随机 `SHOUYIN_SECRET`），搬 SQLite 数据并逐表核对行数，
admin 还是默认密码的换成随机密码（存在 `/root/shouyin-admin-初始密码.txt`），其他默认密码账号（演示账号）停用，
装开机自启服务 `shouyin`、Nginx 80 端口反代、每天 23:30 备份。可重复运行，已有配置和数据不会被覆盖。

## 日常

| 做什么 | 命令 |
|---|---|
| 看初始 admin 密码 | `cat /root/shouyin-admin-初始密码.txt`（登录后台改掉后删除） |
| 忘记密码 | `shouyin-passwd admin` |
| 更新到新版本 | `shouyin-update 新代码包.tar.gz`（先备份；新版本起不来自动退回） |
| 手动备份 | `shouyin-backup`（备份在 `/var/backups/shouyin`，保留 30 份） |
| 恢复备份 | `systemctl stop shouyin && su postgres -c "pg_restore --clean --if-exists -d shouyin 备份.dump" && systemctl start shouyin` |
| 看日志 | `journalctl -u shouyin -n 100` |
| 看自动更新记录 | `journalctl -u shouyin-autodeploy -n 50` |
| 暂停 / 恢复自动更新 | `touch /etc/shouyin/autodeploy.pause` / `rm /etc/shouyin/autodeploy.pause` |

## 自动更新（推 deploy 分支即上线）

服务器每 3 分钟查一次 GitHub 上的 `deploy` 分支，有新提交就自动下载、先备份数据库、换新版本；新版本起不来自动退回旧版本，
并给 `/etc/shouyin/autodeploy.env` 里 `ALERT_TO=` 的邮箱发信（用服务器上已配好的 msmtp）。同一个提交失败后不重试，修好后推新提交。

上线：把已合并到 main、测试通过的提交推到 deploy，例如 `git push origin main:deploy`。回退：把旧提交推到 deploy（`git push -f origin <旧提交>:deploy`）。

**只上线测试通过的提交**：每次推送 GitHub Actions 会自动跑全部测试（`.github/workflows/tests.yml`，job 名 `tests`）。
服务器发现 deploy 有新提交后先查这一项：还在跑就等下一轮；没通过就不上线，发信提醒，线上保持原版本
（在 GitHub 上重新跑通过后会自动上线）；等了 30 分钟还没有结果也发一次提醒。
GitHub Actions 出故障又急着上线、或回退到加测试之前的旧提交时，在 `/etc/shouyin/autodeploy.env` 里写 `REQUIRE_CI=0`，上线后删掉这一行。

第一次安装（root，在服务器上运行一次，`<提交>` 换成含本功能的提交、`<当前线上提交>` 换成服务器正在用的完整提交号）：

```bash
cd /root && curl -fsSL -o a.tgz https://codeload.github.com/ae2928266172-tech/Aether/tar.gz/<提交> \
  && rm -rf src && mkdir src && tar -xzf a.tgz -C src --strip-components=1 \
  && install -m 755 src/deploy/autodeploy.sh /usr/local/bin/shouyin-autodeploy \
  && install -m 644 src/deploy/shouyin-autodeploy.service src/deploy/shouyin-autodeploy.timer /etc/systemd/system/ \
  && mkdir -p /var/lib/shouyin/autodeploy && echo <当前线上提交> > /var/lib/shouyin/autodeploy/deployed \
  && systemctl daemon-reload && systemctl enable --now shouyin-autodeploy.timer
```

有域名和 ICP 备案后，再在 `nginx-shouyin.conf` 里加 443（HTTPS）。
