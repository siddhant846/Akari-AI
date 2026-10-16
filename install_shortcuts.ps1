$WshShell = New-Object -ComObject WScript.Shell
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$vbsPath = Join-Path $scriptDir "launch_akari.vbs"

# 1. Desktop Shortcut
$desktopPath = [Environment]::GetFolderPath('Desktop')
$desktopShortcutPath = Join-Path $desktopPath "Akari AI.lnk"
$shortcut = $WshShell.CreateShortcut($desktopShortcutPath)
$shortcut.TargetPath = "wscript.exe"
$shortcut.Arguments = "`"$vbsPath`""
$shortcut.WorkingDirectory = $scriptDir
$shortcut.Description = "Launch Akari AI Voice Assistant"
$shortcut.Save()
Write-Host "[SUCCESS] Created Desktop Shortcut: $desktopShortcutPath"

# 2. Startup Folder Shortcut (Silent background voice listener on Windows boot)
$silentVbsPath = Join-Path $scriptDir "start_background_voice_service.vbs"
$startupPath = [Environment]::GetFolderPath('Startup')
$startupShortcutPath = Join-Path $startupPath "Akari AI.lnk"
$startupShortcut = $WshShell.CreateShortcut($startupShortcutPath)
$startupShortcut.TargetPath = "wscript.exe"
$startupShortcut.Arguments = "`"$silentVbsPath`""
$startupShortcut.WorkingDirectory = $scriptDir
$startupShortcut.Description = "Akari AI Background Voice Assistant"
# $startupShortcut.Save() - kept optional per user preference
Write-Host "[INFO] Startup shortcut points to silent background voice listener."
