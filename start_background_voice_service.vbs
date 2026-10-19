' ==============================================================================
' Akari AI — Completely Silent Background Voice Service
' Starts the Python agent & Node server with ZERO windows (no browser, no CMD popup).
' Survives PowerShell / terminal closures and runs completely detached in the background.
' ==============================================================================

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' 1. Clean up any existing instances on ports 3000 and 8765 synchronously
WshShell.Run "cmd /c for /f ""tokens=5"" %a in ('netstat -aon ^| findstr :3000') do @if not ""%a""==""0"" taskkill /F /PID %a >nul 2>&1", 0, True
WshShell.Run "cmd /c for /f ""tokens=5"" %a in ('netstat -aon ^| findstr :8765') do @if not ""%a""==""0"" taskkill /F /PID %a >nul 2>&1", 0, True
WScript.Sleep 1000

' 2. Start Python Desktop Agent in completely hidden window (0 = hidden)
pythonPath = scriptDir & "\venv\Scripts\python.exe"
If Not fso.FileExists(pythonPath) Then
    pythonPath = "python"
End If
WshShell.Run """" & pythonPath & """ """ & scriptDir & "\run_agent.py""", 0, False

WScript.Sleep 1500

' 3. Start Node.js Server in completely hidden window (0 = hidden)
WshShell.Run "cmd /c cd /d """ & scriptDir & """ && npx tsx server.ts", 0, False
