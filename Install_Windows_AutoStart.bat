@echo off
title Akari AI - Windows Auto-Start Installer
echo ================================================================
echo    AKARI AI - WINDOWS NATIVE AUTO-START ^& DESKTOP INSTALLER
echo ================================================================
echo.

cd /d "%~dp0"

echo [1/2] Building latest production bundle...
call npm run build

echo.
echo [2/2] Installing Desktop Shortcut ^& Windows Startup Hook...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install_shortcuts.ps1"

echo.
echo ================================================================
echo [SUCCESS] AKARI AI IS NOW FULLY CONFIGURED FOR WINDOWS!
echo.
echo 1. Desktop Shortcut created: "Akari AI" on your Windows Desktop.
echo 2. Windows Auto-Start active: Akari will boot automatically
echo    whenever you turn on or open your laptop!
echo 3. Always-Listening Wake Word: Say "Wake up Akari" or "Hey Akari"
echo    to get an immediate voice response!
echo ================================================================
echo.
pause
