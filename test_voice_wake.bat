@echo off
title Akari AI - Voice Wake Diagnostic Test
cd /d "%~dp0"
echo ================================================================
echo           AKARI AI - VOICE ACTIVATION DIAGNOSTIC TEST
echo ================================================================
echo.
echo 1. Initializing Python Agent ^& Windows Speech Recognizer...
echo 2. Please speak aloud clearly: "Wakeup Akari" or "Hey Akari"
echo.
echo [Listening] Say "Wakeup Akari" now...
echo ----------------------------------------------------------------
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0agent\wake_listener.ps1"
pause
