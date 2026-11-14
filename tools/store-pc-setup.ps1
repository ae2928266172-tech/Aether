# 门店收银电脑一键设置：用 Windows 自带的 Edge 直接出票（不弹打印框），不需要安装 Chrome。
# 做的事情：
#   1. 把小票机（默认找名字里带 POS58 的打印机）设为默认打印机，并关闭“让 Windows 管理默认打印机”
#   2. 在桌面创建“门店工作台”快捷方式：Edge 应用窗口 + 静默打印（--kiosk-printing）
#   3. 可选：开机自动打开门店工作台
# 只改当前 Windows 用户的设置，可以随时删除快捷方式恢复。
param(
    [string]$Url = "",
    [string]$Printer = "POS58",
    [switch]$AutoStart
)

$ErrorActionPreference = "Stop"
function Say($msg, $color = "White") { Write-Host $msg -ForegroundColor $color }

Say "=== 门店收银电脑设置 ===" Cyan

# ---------- 系统地址 ----------
if (-not $Url) {
    Say "请输入收银系统的门店工作台地址（部署到服务器后由管理员提供，例如 https://shouyin.example.com/web/store/）"
    $Url = Read-Host "地址"
}
$Url = $Url.Trim()
if (-not $Url) { Say "没有输入地址，已退出。" Red; exit 1 }
if ($Url -notmatch '^https?://') { $Url = "http://" + $Url }
if ($Url -notmatch '/web/store') { $Url = $Url.TrimEnd('/') + "/web/store/" }

# ---------- 小票机设为默认打印机 ----------
$p = Get-Printer | Where-Object { $_.Name -like "*$Printer*" } | Select-Object -First 1
if (-not $p) {
    Say "没有找到名字里带“$Printer”的打印机。现有打印机：" Yellow
    Get-Printer | ForEach-Object { Say ("   " + $_.Name) }
    $name = Read-Host "请输入小票机的完整名称（直接回车跳过这一步）"
    if ($name) { $p = Get-Printer -Name $name -ErrorAction SilentlyContinue }
}
if ($p) {
    # 关闭“让 Windows 管理默认打印机”，否则 Windows 会自己改回别的打印机
    Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Windows" -Name "LegacyDefaultPrinterMode" -Value 1 -Type DWord
    (New-Object -ComObject WScript.Network).SetDefaultPrinter($p.Name)
    Say ("已把“" + $p.Name + "”设为默认打印机") Green
} else {
    Say "跳过了默认打印机设置；静默打印会使用当前的默认打印机。" Yellow
}

# ---------- 找到 Edge ----------
$edge = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { Say "没有找到 Microsoft Edge（Windows 10 / 11 自带）。" Red; exit 1 }

# 单独的配置目录：保证这个窗口一定带着静默打印参数启动，不受平时浏览器的影响
$profileDir = Join-Path $env:LOCALAPPDATA "ShouyinStore"
New-Item -ItemType Directory -Force $profileDir | Out-Null
$edgeArgs = "--kiosk-printing --app=`"$Url`" --user-data-dir=`"$profileDir`" --no-first-run --disable-features=Translate"

# ---------- 快捷方式 ----------
$shell = New-Object -ComObject WScript.Shell
function MakeLink($path) {
    $lnk = $shell.CreateShortcut($path)
    $lnk.TargetPath = $edge
    $lnk.Arguments = $edgeArgs
    $lnk.WorkingDirectory = Split-Path $edge
    $lnk.IconLocation = "$edge,0"
    $lnk.Description = "收银系统门店工作台（直接出票）"
    $lnk.Save()
}
$desktop = [Environment]::GetFolderPath("Desktop")
MakeLink (Join-Path $desktop "门店工作台.lnk")
Say "已在桌面创建“门店工作台”快捷方式" Green

if (-not $AutoStart) {
    $ans = Read-Host "是否开机自动打开门店工作台？(Y/N，默认 Y)"
    $AutoStart = ($ans -eq "" -or $ans -match '^[Yy]')
}
if ($AutoStart) {
    MakeLink (Join-Path ([Environment]::GetFolderPath("Startup")) "门店工作台.lnk")
    Say "已设置开机自动打开" Green
}

Say ""
Say "设置完成。接下来：" Cyan
Say "  1. 双击桌面“门店工作台”，登录门店账号"
Say "  2. 右上角“本机设置”里勾选“新订单自动打印”和“收银后自动打印”"
Say "  3. 打印机“打印首选项”里纸张选 58mm、边距 0（只需设一次）"
Say "  4. 以后都从这个快捷方式打开，静默打印才会生效"
Say ""
Read-Host "按回车关闭"
