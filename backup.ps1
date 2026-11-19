# 备份数据库和商品图片（收银照常进行时也可以运行）。
# 备份放在 %LOCALAPPDATA%\shouyin\backups，并另存一份到本文件夹下的“数据库备份”（在 OneDrive 里，会同步到云端）。
# 每份都先做完整性检查再压缩，各保留最近 30 份。日志在 %LOCALAPPDATA%\shouyin\backup.log。
# 用法：.\backup.ps1；每天自动备份用 .\install_backup_task.ps1 装一次就行。
param([int]$Keep = 30, [string]$CopyTo = (Join-Path $PSScriptRoot "数据库备份"),
      [string]$Python = "$env:USERPROFILE\.venvs\shouyin\Scripts\python.exe")

$data = Join-Path $env:LOCALAPPDATA "shouyin"
$env:DATABASE_URL = "sqlite:///" + ($data -replace '\\', '/') + "/shouyin.db"
$env:SHOUYIN_MEDIA = Join-Path $data "media"
$env:PYTHONUTF8 = "1"
[Console]::OutputEncoding = [Text.Encoding]::UTF8  # 按 UTF-8 读 Python 的输出，日志里中文不乱码
$log = Join-Path $data "backup.log"
$args_ = @((Join-Path $PSScriptRoot "backend\scripts\backup_db.py"), "--keep", $Keep)
if ($CopyTo) { $args_ += @("--copy-to", $CopyTo) }

"==== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ====" | Out-File -Append -Encoding utf8 $log
$out = & $Python @args_ 2>&1
$code = $LASTEXITCODE
$out | Out-File -Append -Encoding utf8 $log
$out | ForEach-Object { Write-Host $_ }
exit $code
