' ============================================================================
' Akari AI — Standalone Windows Desktop App Launcher
' Checks if the silent background server is running; if not, starts it.
' Once the server is ready, opens the native, borderless Akari desktop app window.
' ============================================================================

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir

Function IsServerAlive()
    On Error Resume Next
    Dim http
    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    http.setTimeouts 400, 400, 400, 400
    http.open "GET", "http://127.0.0.1:3000", False
    http.send
    If Err.Number = 0 Then
        IsServerAlive = True
    Else
        IsServerAlive = False
    End If
    Set http = Nothing
    On Error GoTo 0
End Function

' 1. If server is not yet running, launch it in silent background mode
If Not IsServerAlive() Then
    WshShell.Run "wscript.exe """ & scriptDir & "\start_background_voice_service.vbs""", 0, False
    ' Wait for server to bind port 3000
    For i = 1 To 20
        WScript.Sleep 500
        If IsServerAlive() Then Exit For
    Next
End If

' 2. Launch the Desktop App Window
electronExe = scriptDir & "\node_modules\electron\dist\electron.exe"

If fso.FileExists(electronExe) Then
    WshShell.Run """" & electronExe & """ """ & scriptDir & """", 1, False
Else
    ' Standalone App window via Chrome or Edge
    chromePath = WshShell.ExpandEnvironmentStrings("%ProgramFiles%\Google\Chrome\Application\chrome.exe")
    chromePathX86 = WshShell.ExpandEnvironmentStrings("%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe")
    chromeLocal = WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe")
    edgePath = WshShell.ExpandEnvironmentStrings("%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe")
    edgePath64 = WshShell.ExpandEnvironmentStrings("%ProgramFiles%\Microsoft\Edge\Application\msedge.exe")
    
    appUrl = "http://localhost:3000"
    
    If fso.FileExists(chromePath) Then
        WshShell.Run """" & chromePath & """ --app=""" & appUrl & """ --start-maximized", 1, False
    ElseIf fso.FileExists(edgePath) Then
        WshShell.Run """" & edgePath & """ --app=""" & appUrl & """ --start-maximized", 1, False
    ElseIf fso.FileExists(edgePath64) Then
        WshShell.Run """" & edgePath64 & """ --app=""" & appUrl & """ --start-maximized", 1, False
    ElseIf fso.FileExists(chromeLocal) Then
        WshShell.Run """" & chromeLocal & """ --app=""" & appUrl & """ --start-maximized", 1, False
    ElseIf fso.FileExists(chromePathX86) Then
        WshShell.Run """" & chromePathX86 & """ --app=""" & appUrl & """ --start-maximized", 1, False
    Else
        WshShell.Run appUrl, 1, False
    End If
End If
