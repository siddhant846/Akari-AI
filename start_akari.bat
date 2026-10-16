@echo off
title Akari AI Launcher
echo AKARI AI - Windows Start Script
echo ==========================================================
echo.

:: Ensure we are in the project root directory
cd /d "%~dp0"

echo [*] Cleaning up any stale background processes on ports 3000 and 8765...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do (
    if not "%%a"=="0" taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8765') do (
    if not "%%a"=="0" taskkill /F /PID %%a >nul 2>&1
)

echo [1/2] Launching Python Desktop Agent...
:: Check if virtual environment exists and use its python, otherwise fallback to global python
if exist "venv\Scripts\python.exe" (
    start "Akari Desktop Agent (Python)" cmd /k "venv\Scripts\python.exe run_agent.py"
) else (
    start "Akari Desktop Agent (Python)" cmd /k "python run_agent.py"
)

:: Wait 3 seconds for Python to initialize
ping 127.0.0.1 -n 4 >nul

echo [2/2] Launching Node.js Server ^& Vite Frontend...
start "Akari Web Server (Node)" cmd /k "npm run dev"

echo.
echo Waiting 5 seconds for servers to compile and bind port 3000...
ping 127.0.0.1 -n 6 >nul

echo.
echo ==========================================================
echo AKARI AI IS RUNNING!
echo.
echo 🎙️ SYSTEM-WIDE VOICE ACTIVATION IS ACTIVE:
echo    Speak aloud "Wakeup Akari" from ANY screen or desktop
echo    and Akari will immediately unminimize and activate!
echo.
echo Open your browser to: http://localhost:3000
echo Launching default browser...
start http://localhost:3000
echo.
echo Note: The Python agent and Node server are running in the
echo two newly opened command prompt windows.
echo ==========================================================
echo.
pause
