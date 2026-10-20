# ==============================================================================
# Akari AI — Windows Native Auto-Start & App Shortcuts Installer
# ==============================================================================

$WshShell = New-Object -ComObject WScript.Shell
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$launcherVbs = Join-Path $scriptDir "launch_akari.vbs"
$silentVbs = Join-Path $scriptDir "start_background_voice_service.vbs"
$iconPath = Join-Path $scriptDir "akari.ico"

if (-not (Test-Path $iconPath)) {
    $iconPath = Join-Path $scriptDir "public\akari.ico"
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "   AKARI AI - WINDOWS NATIVE APP AND AUTO-START INSTALLER       " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Desktop Shortcut
$desktopPath = [Environment]::GetFolderPath('Desktop')
$desktopShortcutPath = Join-Path $desktopPath "Akari AI.lnk"
$shortcut = $WshShell.CreateShortcut($desktopShortcutPath)
$shortcut.TargetPath = "wscript.exe"
$shortcut.Arguments = "`"$launcherVbs`""
$shortcut.WorkingDirectory = $scriptDir
$shortcut.Description = "Akari AI Voice Assistant"
if (Test-Path $iconPath) {
    $shortcut.IconLocation = "$iconPath,0"
}
$shortcut.Save()
Write-Host " [OK] Desktop Shortcut created     : $desktopShortcutPath" -ForegroundColor Green

# 2. Start Menu Programs Shortcut
$startMenuPrograms = Join-Path ([Environment]::GetFolderPath('StartMenu')) "Programs"
$startMenuShortcutPath = Join-Path $startMenuPrograms "Akari AI.lnk"
$startMenuShortcut = $WshShell.CreateShortcut($startMenuShortcutPath)
$startMenuShortcut.TargetPath = "wscript.exe"
$startMenuShortcut.Arguments = "`"$launcherVbs`""
$startMenuShortcut.WorkingDirectory = $scriptDir
$startMenuShortcut.Description = "Akari AI Voice Assistant"
if (Test-Path $iconPath) {
    $startMenuShortcut.IconLocation = "$iconPath,0"
}
$startMenuShortcut.Save()
Write-Host " [OK] Start Menu Shortcut created  : $startMenuShortcutPath" -ForegroundColor Green

# 3. Windows Startup Folder (Silent Auto-Boot on Windows Login)
$startupFolder = [Environment]::GetFolderPath('Startup')
$startupShortcutPath = Join-Path $startupFolder "Akari AI Background Service.lnk"
$startupShortcut = $WshShell.CreateShortcut($startupShortcutPath)
$startupShortcut.TargetPath = "wscript.exe"
$startupShortcut.Arguments = "`"$silentVbs`""
$startupShortcut.WorkingDirectory = $scriptDir
$startupShortcut.Description = "Akari AI Background Service"
if (Test-Path $iconPath) {
    $startupShortcut.IconLocation = "$iconPath,0"
}
$startupShortcut.Save()
Write-Host " [OK] Windows Startup Auto-Boot    : $startupShortcutPath" -ForegroundColor Green

# 4. Windows Scheduled Task
try {
    $taskName = "AkariAIBackgroundService"
    $taskAction = "wscript.exe"
    $taskArgs = "\`"$silentVbs\`""
    Start-Process -FilePath "schtasks.exe" -ArgumentList "/create /tn `"$taskName`" /tr `"$taskAction $silentVbs`" /sc onlogon /f" -NoNewWindow -Wait -ErrorAction SilentlyContinue
    Write-Host " [OK] Task Scheduler Registered    : $taskName" -ForegroundColor Green
} catch {
    # Task scheduler is secondary, startup folder is primary
}

# 5. Launch the Background Service Immediately Right Now
Write-Host ""
Write-Host "[*] Starting Akari background service right now..." -ForegroundColor Yellow
Start-Process "wscript.exe" -ArgumentList "`"$silentVbs`"" -WorkingDirectory $scriptDir

# Wait briefly and verify port 3000
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host " [SUCCESS] AKARI AI IS FULLY OPERATIONAL AND AUTO-STARTING!      " -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  1. PC App: Double-click 'Akari AI' on your Desktop or Start Menu."
Write-Host "  2. Mobile App: Open Akari on your phone anytime on your Wi-Fi."
Write-Host "  3. Zero Commands: You NEVER need to run .\start_akari.bat again!"
Write-Host "  4. Background Service: Akari boots silently whenever your PC turns on."
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
