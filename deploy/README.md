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

更新会重启服务端，收银中断约 1 分钟（页面会自动重连），尽量在不营业的时候更新。不做自动更新：每次都由管理员确认后手动执行。

有域名和 ICP 备案后，再在 `nginx-shouyin.conf` 里加 443（HTTPS）。
