# ==============================================================================
# Akari AI - PowerShell Background Service Launcher
# Launches detached server & agent processes that survive closing PowerShell.
# ==============================================================================

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "          AKARI AI - DETACHED BACKGROUND SERVICE LAUNCHER             " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[*] Stopping any existing instances on ports 3000 and 8765..." -ForegroundColor Yellow

Get-NetTCPConnection -LocalPort 3000, 8765 -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}

Write-Host "[*] Launching detached background services via WScript host..." -ForegroundColor Cyan
Start-Process -FilePath "wscript.exe" -ArgumentList "`"$scriptDir\start_background_voice_service.vbs`""

Start-Sleep -Seconds 4

Write-Host ""
Write-Host "[SUCCESS] AKARI AI IS NOW RUNNING SILENTLY IN THE BACKGROUND!" -ForegroundColor Green
Write-Host " - Node Server: http://localhost:3000" -ForegroundColor White
Write-Host " - Python Agent: http://127.0.0.1:8765" -ForegroundColor White
Write-Host ""
Write-Host "[*] Your PC's Local Network IP(s) for Mobile Akari:" -ForegroundColor Cyan
Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi*", "Ethernet*" -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike "127.*" } | ForEach-Object {
    Write-Host "    ==> http://$($_.IPAddress):3000" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "======================================================================" -ForegroundColor Green
Write-Host " IMPORTANT: YOU CAN SAFELY CLOSE THIS POWERSHELL WINDOW NOW!" -ForegroundColor Green
Write-Host " Closing PowerShell will NOT stop Akari. Mobile Akari will continue" -ForegroundColor Green
Write-Host " working continuously in the background." -ForegroundColor Green
Write-Host " To stop Akari at any time, run: .\stop_akari.bat" -ForegroundColor White
Write-Host "======================================================================" -ForegroundColor Green
