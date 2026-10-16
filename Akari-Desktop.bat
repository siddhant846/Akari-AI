@echo off
title Akari AI Desktop Assistant
cd /d "%~dp0"

echo =======================================================
echo           Starting Akari AI Desktop Software          
echo =======================================================
echo.

:: 1. Start backend server in a separate process
echo [1/2] Initializing Akari Gateway & Python Agent...
start /B cmd /c "npm run dev" > nul 2>&1

:: 2. Wait briefly for server to bind port 3000
timeout /t 2 /nobreak > nul

:: 3. Launch dedicated standalone desktop window instantly (0s wait, no slow downloads)
echo [2/2] Opening Akari Desktop Window...
if exist "node_modules\electron\dist\electron.exe" (
    start "" "node_modules\electron\dist\electron.exe" .
) else (
    start msedge --app=http://localhost:3000 --window-size=1366,860 --app-id=AkariAI 2>nul || start chrome --app=http://localhost:3000 --window-size=1366,860 || start http://localhost:3000
)

echo.
echo Akari is ready!
timeout /t 3 /nobreak > nul
exit
