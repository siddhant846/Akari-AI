' ==============================================================================
' Akari AI — Completely Silent Background Voice Service
' Starts the Python agent & Node server with ZERO windows (no browser, no CMD popup).
' Keeps the microphone continuously listening in the background for "Wakeup Akari".
' When "Wakeup Akari" is spoken, Akari automatically opens onto your screen!
' ==============================================================================

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' 1. Start Python Desktop Agent in completely hidden window (0 = hidden)
pythonPath = scriptDir & "\venv\Scripts\python.exe"
If Not fso.FileExists(pythonPath) Then
    pythonPath = "python"
End If
WshShell.Run """" & pythonPath & """ """ & scriptDir & "\run_agent.py""", 0, False

' 2. Start Node.js Server in completely hidden window (0 = hidden)
WshShell.Run "cmd /c cd /d """ & scriptDir & """ && npx tsx server.ts", 0, False
