' ============================================================================
' Akari AI — Silent Native Windows Launcher
' Launches Python Desktop Agent & Node.js Server in silent background mode,
' then opens Akari in a standalone, borderless Windows App window.
' ============================================================================

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get project directory
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' 1. Start Python Desktop Agent in silent background (0 = hidden window)
pythonPath = scriptDir & "\venv\Scripts\python.exe"
If Not fso.FileExists(pythonPath) Then
    pythonPath = "python"
End If
WshShell.Run """" & pythonPath & """ """ & scriptDir & "\run_agent.py""", 0, False

' 2. Start Node.js Server in silent background (0 = hidden window)
serverScript = scriptDir & "\dist\server.cjs"
If fso.FileExists(serverScript) Then
    WshShell.Run "node """ & serverScript & """", 0, False
Else
    WshShell.Run "cmd /c cd /d """ & scriptDir & """ && npm run dev", 0, False
End If

' 3. Wait for server to initialize
WScript.Sleep 2500

' 4. Launch in Chrome / Edge App Mode (Standalone window on Windows desktop)
chromePath = WshShell.ExpandEnvironmentStrings("%ProgramFiles%\Google\Chrome\Application\chrome.exe")
chromePathX86 = WshShell.ExpandEnvironmentStrings("%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe")
chromeLocal = WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe")
edgePath = WshShell.ExpandEnvironmentStrings("%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe")
edgePath64 = WshShell.ExpandEnvironmentStrings("%ProgramFiles%\Microsoft\Edge\Application\msedge.exe")

appUrl = "http://localhost:3000"

If fso.FileExists(chromePath) Then
    WshShell.Run """" & chromePath & """ --app=""" & appUrl & """ --start-maximized", 1, False
ElseIf fso.FileExists(chromePathX86) Then
    WshShell.Run """" & chromePathX86 & """ --app=""" & appUrl & """ --start-maximized", 1, False
ElseIf fso.FileExists(chromeLocal) Then
    WshShell.Run """" & chromeLocal & """ --app=""" & appUrl & """ --start-maximized", 1, False
ElseIf fso.FileExists(edgePath) Then
    WshShell.Run """" & edgePath & """ --app=""" & appUrl & """ --start-maximized", 1, False
ElseIf fso.FileExists(edgePath64) Then
    WshShell.Run """" & edgePath64 & """ --app=""" & appUrl & """ --start-maximized", 1, False
Else
    WshShell.Run appUrl, 1, False
End If
