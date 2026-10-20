' ==============================================================================
' Akari AI — Completely Silent Background Voice Service (Always-On Windows Daemon)
' Starts the Node.js Server & Python Agent with ZERO windows (no browser, no CMD popup).
' Survives PowerShell / terminal closures and runs completely detached in the background.
' ==============================================================================

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

' If Akari server is already alive and running, do not re-spawn or interrupt
If IsServerAlive() Then
    WScript.Quit 0
End If

' 1. Clean up any stale zombie processes on ports 3000 and 8765 synchronously
WshShell.Run "cmd /c for /f ""tokens=5"" %a in ('netstat -aon ^| findstr :3000') do @if not ""%a""==""0"" taskkill /F /PID %a >nul 2>&1", 0, True
WshShell.Run "cmd /c for /f ""tokens=5"" %a in ('netstat -aon ^| findstr :8765') do @if not ""%a""==""0"" taskkill /F /PID %a >nul 2>&1", 0, True
WScript.Sleep 500

' 2. Launch backend runner script with 0 = hidden window (completely invisible)
batchRunner = scriptDir & "\run_backend_silent.bat"
WshShell.Run "cmd /c """ & batchRunner & """", 0, False

' 3. Wait up to 10 seconds for port 3000 to be online
For i = 1 To 20
    WScript.Sleep 500
    If IsServerAlive() Then Exit For
Next
