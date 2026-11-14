# 本机试用启动脚本（Windows PowerShell）
# 数据库放在本机 %LOCALAPPDATA%\shouyin，不放 OneDrive，避免同步时损坏数据库文件。
# 用法：右键“使用 PowerShell 运行”，或在终端里运行 .\start.ps1；然后浏览器打开 http://127.0.0.1:8000
param([int]$Port = 8000, [string]$Python = "$env:USERPROFILE\.venvs\shouyin\Scripts\python.exe")

$data = Join-Path $env:LOCALAPPDATA "shouyin"
New-Item -ItemType Directory -Force $data | Out-Null
$env:DATABASE_URL = "sqlite:///" + ($data -replace '\\', '/') + "/shouyin.db"
$env:SHOUYIN_MEDIA = Join-Path $data "media"

if (-not (Test-Path $Python)) {
    Write-Host "首次运行：创建 Python 环境并安装依赖……"
    py -3.13 -m venv "$env:USERPROFILE\.venvs\shouyin"
    & $Python -m pip install -r (Join-Path $PSScriptRoot "backend\requirements.txt")
}

Write-Host "后台管理：   http://127.0.0.1:$Port/web/admin/"
Write-Host "门店工作台： http://127.0.0.1:$Port/web/store/"
Write-Host "数据目录：   $data"
Set-Location (Join-Path $PSScriptRoot "backend")
& $Python -m uvicorn app.main:app --host 0.0.0.0 --port $Port
