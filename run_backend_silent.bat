@echo off
cd /d "%~dp0"
if not exist "logs" mkdir "logs"

if exist "dist\server.cjs" (
    node dist\server.cjs > logs\server.log 2>&1
) else (
    npx tsx server.ts > logs\server.log 2>&1
)
