@echo off
title Stop Akari AI
cd /d "%~dp0"

echo ======================================================================
echo                  STOPPING AKARI AI SERVICES
echo ======================================================================
echo.

echo [*] Terminating Node.js Server on port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do (
    if not "%%a"=="0" taskkill /F /PID %%a >nul 2>&1
)

echo [*] Terminating Python Desktop Agent on port 8765...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8765') do (
    if not "%%a"=="0" taskkill /F /PID %%a >nul 2>&1
)

echo.
echo ======================================================================
echo [SUCCESS] Akari AI background services have been stopped.
echo ======================================================================
echo.
pause
