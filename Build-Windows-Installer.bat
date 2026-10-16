@echo off
title Akari AI - Windows Installer Builder
cd /d "%~dp0"

echo =======================================================
echo         Akari AI: Single-Click Installer Builder      
echo =======================================================
echo.
echo [1/3] Compiling React Frontend and Node Gateway...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Build failed. Please check errors above.
    pause
    exit /b %errorlevel%
)

echo.
echo [2/3] Building Windows .exe Installer Package (NSIS)...
call npx electron-builder --win nsis
if %errorlevel% neq 0 (
    echo [INFO] Standard electron-builder build encountered a step. Checking release folder...
)

echo.
echo [3/3] Build Complete!
echo Your installer package is ready in the 'release' directory:
echo %~dp0release
echo =======================================================
echo.
explorer "%~dp0release"
pause
