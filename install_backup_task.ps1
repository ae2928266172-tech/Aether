# 装一个 Windows 计划任务：每天自动运行 backup.ps1 备份数据库。
# 电脑在那个时间关机或睡眠的话，下次开机后会补做一次。只需要运行一次；重复运行会覆盖原来的设置。
# 用法：.\install_backup_task.ps1 [-At 22:30]；删除任务：.\install_backup_task.ps1 -Remove
param([string]$At = "22:30", [switch]$Remove)

$name = "收银系统每日备份"
if ($Remove) {
    Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "已删除计划任务：$name"
    exit 0
}
$script = Join-Path $PSScriptRoot "backup.ps1"
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`"" -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings `
    -Description "每天备份收银系统数据库和商品图片（$script）" -Force | Out-Null
Write-Host "已设置：每天 $At 自动备份（错过时开机后补做）。任务名：$name"
Write-Host "现在先手动备份一次……"
& $script
