@echo off
chcp 65001 >nul
cd /d "%~dp0"

:: 1. Launch Python Desktop Agent silently in background (hosts the wake word listener)
if exist "venv\Scripts\python.exe" (
    start "" /B "venv\Scripts\python.exe" run_agent.py
) else (
    start "" /B python run_agent.py
)

:: Brief pause for agent initialization
timeout /t 2 /nobreak >nul

:: 2. Launch Node Server silently in background
if exist "dist\server.cjs" (
    start "" /B node dist\server.cjs
) else (
    start "" /B npm run dev
)
