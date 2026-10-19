@echo off
title Akari AI - Background Service
cd /d "%~dp0"

echo ======================================================================
echo           AKARI AI - DETACHED BACKGROUND SERVICE LAUNCHER
echo ======================================================================
echo.
echo [*] Cleaning up existing processes on ports 3000 and 8765...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do (
    if not "%%a"=="0" taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8765') do (
    if not "%%a"=="0" taskkill /F /PID %%a >nul 2>&1
)

echo [*] Launching detached background services (Python Agent + Node Server)...
start "" wscript.exe "%~dp0start_background_voice_service.vbs"

echo [*] Initializing servers (waiting 4 seconds)...
ping 127.0.0.1 -n 5 >nul

echo.
echo ======================================================================
echo [SUCCESS] AKARI AI IS NOW RUNNING SILENTLY IN THE BACKGROUND!
echo ======================================================================
echo.
echo  - Node.js API ^& Voice Server : http://localhost:3000
echo  - Python Agent (PC Control)  : http://127.0.0.1:8765
echo.
echo [*] Your PC's Local Network IP(s) for Mobile Akari:
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /i "IPv4"') do (
    echo     ==^> http://%%i:3000
)
echo.
echo ======================================================================
echo  IMPORTANT: YOU CAN SAFELY CLOSE THIS POWERSHELL / CMD WINDOW NOW!
echo  Closing this window will NOT stop Akari.
echo  Akari runs detached and will continuously respond to your mobile phone.
echo.
echo  To STOP Akari at any time, run: stop_akari.bat
echo ======================================================================
echo.
pause
