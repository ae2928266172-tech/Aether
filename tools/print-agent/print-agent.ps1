# 收银系统 · 打印小助手
# 装在接 58mm 小票机（如 POS58）的电脑上，不需要浏览器，Win7 自带的 PowerShell 2.0 就能运行。
# 它每隔几秒向收银系统取一次本店的打印任务，收到后：新订单先响铃播报，再把小票原样发给小票机。
#
#   安装：双击“安装打印小助手.bat”（会问系统地址、打印密钥、选小票机，并设为开机自动运行）
#   卸载：双击“卸载打印小助手.bat”
#   手动运行：powershell -ExecutionPolicy Bypass -File print-agent.ps1
param(
    [switch]$Install,
    [switch]$Uninstall,
    [switch]$Once,
    [string]$Server = "",
    [string]$Key = "",
    [string]$Printer = ""
)

$Home2 = Join-Path $env:APPDATA "ShouyinPrint"
$IniPath = Join-Path $Home2 "config.ini"
$LogPath = Join-Path $Home2 "agent.log"
$StartupLink = Join-Path ([Environment]::GetFolderPath("Startup")) "收银打印小助手.lnk"

function Log($msg) {
    $line = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss") + "  " + $msg
    Write-Host $line
    try {
        if (-not (Test-Path $Home2)) { New-Item -ItemType Directory -Force $Home2 -ErrorAction Stop | Out-Null }
        if ((Test-Path $LogPath) -and ((Get-Item $LogPath).Length -gt 1MB)) { Move-Item $LogPath ($LogPath + ".old") -Force -ErrorAction Stop }
        Add-Content -Path $LogPath -Value $line -Encoding UTF8 -ErrorAction Stop
    } catch {}
}

function Read-Ini {
    $cfg = @{}
    if (Test-Path $IniPath) {
        Get-Content $IniPath -Encoding UTF8 | ForEach-Object {
            if ($_ -match '^\s*([^=#]+?)\s*=\s*(.*)$') { $cfg[$matches[1]] = $matches[2].Trim() }
        }
    }
    return $cfg
}

# ---------- 把原始字节发给打印机（Windows 打印后台的 RAW 方式，所有 ESC/POS 小票机通用） ----------
$rawSource = @"
using System;
using System.Runtime.InteropServices;
public class ShouyinRawPrinter {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class DOCINFO { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName; [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPWStr)] public string pDataType; }
    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool OpenPrinter(string name, out IntPtr h, IntPtr d);
    [DllImport("winspool.drv", SetLastError = true)] public static extern bool ClosePrinter(IntPtr h);
    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool StartDocPrinter(IntPtr h, int level, [In] DOCINFO di);
    [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndDocPrinter(IntPtr h);
    [DllImport("winspool.drv", SetLastError = true)] public static extern bool StartPagePrinter(IntPtr h);
    [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndPagePrinter(IntPtr h);
    [DllImport("winspool.drv", SetLastError = true)] public static extern bool WritePrinter(IntPtr h, IntPtr buf, int count, out int written);
    public static string Send(string printer, byte[] data) {
        IntPtr h;
        if (!OpenPrinter(printer, out h, IntPtr.Zero)) return "打开打印机失败，错误码 " + Marshal.GetLastWin32Error();
        try {
            DOCINFO di = new DOCINFO(); di.pDocName = "收银小票"; di.pDataType = "RAW";
            if (!StartDocPrinter(h, 1, di)) return "开始打印失败，错误码 " + Marshal.GetLastWin32Error();
            StartPagePrinter(h);
            IntPtr p = Marshal.AllocCoTaskMem(data.Length);
            Marshal.Copy(data, 0, p, data.Length);
            int written;
            bool ok = WritePrinter(h, p, data.Length, out written);
            Marshal.FreeCoTaskMem(p);
            EndPagePrinter(h); EndDocPrinter(h);
            if (!ok || written != data.Length) return "写入打印机失败，错误码 " + Marshal.GetLastWin32Error();
            return "";
        } finally { ClosePrinter(h); }
    }
}
"@

function Load-Raw { if (-not ("ShouyinRawPrinter" -as [type])) { Add-Type -TypeDefinition $rawSource } }

function Printers { @(Get-WmiObject Win32_Printer | ForEach-Object { $_.Name }) }

function New-Client {
    try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]3072 -bor [Net.SecurityProtocolType]::Tls } catch {}
    $wc = New-Object Net.WebClient
    $wc.Headers.Add("User-Agent", "ShouyinPrintAgent/1.0")
    return $wc
}

function Alert {
    try { (New-Object Media.SoundPlayer "$env:WINDIR\Media\Windows Notify.wav").PlaySync() } catch {
        try { [Media.SystemSounds]::Exclamation.Play() } catch {}
    }
    try {
        Add-Type -AssemblyName System.Speech
        $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
        $s.SpeakAsync("您有新订单") | Out-Null
    } catch {}
}

# ---------------- 安装 ----------------
if ($Install) {
    Write-Host "=== 安装收银打印小助手 ===" -ForegroundColor Cyan
    New-Item -ItemType Directory -Force $Home2 | Out-Null
    $old = Read-Ini
    if (-not $Server) {
        $hint = $old["server"]; if ($hint) { $hint = "（直接回车沿用 $hint）" }
        $Server = Read-Host "收银系统地址，例如 http://192.168.1.10:8000 $hint"
        if (-not $Server) { $Server = $old["server"] }
    }
    if (-not $Key) {
        $Key = Read-Host "打印密钥（后台“门店与区域” → 编辑门店 → 打印小助手里复制）"
        if (-not $Key) { $Key = $old["key"] }
    }
    $Server = $Server.Trim().TrimEnd("/")
    if ($Server -notmatch '^https?://') { $Server = "http://" + $Server }
    $list = Printers
    if (-not $Printer) {
        $guess = $list | Where-Object { $_ -match 'POS|58|80|小票|热敏' } | Select-Object -First 1
        Write-Host "这台电脑上的打印机："
        for ($i = 0; $i -lt $list.Count; $i++) { Write-Host ("  [" + ($i + 1) + "] " + $list[$i]) }
        $ans = Read-Host "选择小票机的编号（直接回车选 $guess）"
        if ($ans -match '^\d+$' -and [int]$ans -ge 1 -and [int]$ans -le $list.Count) { $Printer = $list[[int]$ans - 1] } else { $Printer = $guess }
    }
    if (-not $Printer) { Write-Host "没有选择打印机，已退出。" -ForegroundColor Red; Read-Host "按回车关闭"; exit 1 }

    # 检查连接
    try {
        $wc = New-Client
        $null = $wc.DownloadData("$Server/api/health")
        Write-Host "已连上收银系统" -ForegroundColor Green
    } catch { Write-Host ("暂时连不上 $Server ：" + $_.Exception.Message + "。可以先装好，网络通了会自动连接。") -ForegroundColor Yellow }

    # 复制自己到固定位置，写配置
    Copy-Item $MyInvocation.MyCommand.Path (Join-Path $Home2 "print-agent.ps1") -Force
    @("server=$Server", "key=$Key", "printer=$Printer", "interval=3") | Set-Content -Path $IniPath -Encoding UTF8

    # 开机自动运行（隐藏窗口）
    $ws = New-Object -ComObject WScript.Shell
    $lnk = $ws.CreateShortcut($StartupLink)
    $lnk.TargetPath = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
    $lnk.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"" + (Join-Path $Home2 "print-agent.ps1") + "`""
    $lnk.WorkingDirectory = $Home2
    $lnk.Description = "收银系统打印小助手"
    $lnk.Save()

    # 打一张测试页（直接本机打，不经过系统，用来确认小票机能用）
    Load-Raw
    $esc = [byte[]](27,64,28,38,27,97,1) + [Text.Encoding]::GetEncoding(936).GetBytes("打印小助手已安装`n" + $Printer + "`n`n`n`n") + [byte[]](29,86,66,0)
    $err = [ShouyinRawPrinter]::Send($Printer, $esc)
    if ($err) { Write-Host ("测试打印失败：" + $err) -ForegroundColor Red } else { Write-Host "已发送测试小票，请看小票机是否出纸" -ForegroundColor Green }

    Start-Process "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList $lnk.Arguments -WindowStyle Hidden
    Write-Host ""
    Write-Host "安装完成：打印小助手已在后台运行，以后开机自动运行。" -ForegroundColor Cyan
    Write-Host "日志：$LogPath"
    Read-Host "按回车关闭"
    exit 0
}

# ---------------- 卸载 ----------------
if ($Uninstall) {
    Get-WmiObject Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match 'ShouyinPrint' } | ForEach-Object { $_.Terminate() | Out-Null }
    if (Test-Path $StartupLink) { Remove-Item $StartupLink -Force }
    Write-Host "已停止并取消开机运行。配置和日志保留在 $Home2 ，不需要可以手动删除。" -ForegroundColor Cyan
    Read-Host "按回车关闭"
    exit 0
}

# ---------------- 运行 ----------------
$cfg = Read-Ini
if (-not $Server) { $Server = $cfg["server"] }
if (-not $Key) { $Key = $cfg["key"] }
if (-not $Printer) { $Printer = $cfg["printer"] }
$interval = 3; if ($cfg["interval"] -match '^\d+$') { $interval = [int]$cfg["interval"] }
if (-not ($Server -and $Key -and $Printer)) { Write-Host "还没安装：请双击“安装打印小助手.bat”。" -ForegroundColor Red; exit 1 }

# 只允许运行一个，避免重复出票
$created = $false
$mutex = New-Object Threading.Mutex($true, "Local\ShouyinPrintAgent", [ref]$created)
if (-not $created) { Log "已经有一个打印小助手在运行，本次退出"; exit 0 }

Load-Raw
Log "打印小助手启动：$Server  打印机：$Printer"
$wc = New-Client
$failing = $false
while ($true) {
    try {
        $data = $wc.DownloadData("$Server/api/print-agent/next?key=$Key")
        if ($failing) { Log "已重新连上收银系统"; $failing = $false }
        if ($data -and $data.Length -gt 0) {
            $jobId = $wc.ResponseHeaders["X-Job-Id"]
            $kind = $wc.ResponseHeaders["X-Job-Kind"]
            if ($wc.ResponseHeaders["X-Beep"] -eq "1") { Alert }
            $err = [ShouyinRawPrinter]::Send($Printer, $data)
            if ($err) {
                Log "任务 $jobId 打印失败：$err（90 秒后系统会重发）"
            } else {
                $null = $wc.UploadString("$Server/api/print-agent/done/" + $jobId + "?key=$Key", "")
                Log "任务 $jobId（$kind）已打印"
            }
            continue   # 有任务时马上取下一张
        }
    } catch {
        $msg = $_.Exception.Message
        if ($msg -match '401') { Log "打印密钥无效，请重新安装并填写后台里的新密钥"; if (-not $Once) { Start-Sleep 60 } }
        elseif (-not $failing) { Log ("连接收银系统失败：" + $msg + "，稍后自动重试"); $failing = $true }
    }
    if ($Once) { break }
    Start-Sleep -Seconds $interval
}
