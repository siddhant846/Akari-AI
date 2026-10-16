# ==============================================================================
# Akari AI - Native Windows Background Wake Word Listener
# Uses Windows built-in System.Speech.Recognition.SpeechRecognitionEngine
# Continuously listens in background for "Wakeup Akari" across ANY Windows screen
# ==============================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 1. Compile native Win32 window focus helper
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class Win32WindowHelper {
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    public static List<IntPtr> FindAkariWindows() {
        var results = new List<IntPtr>();
        EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
            StringBuilder sb = new StringBuilder(512);
            GetWindowText(hWnd, sb, sb.Capacity);
            string title = sb.ToString().ToLowerInvariant();
            if (title.Length > 0 && (
                title.Contains("akari") || 
                title.Contains("localhost:3000") || 
                title.Contains("127.0.0.1:3000") ||
                title.Contains("desktop assistant")
            )) {
                results.Add(hWnd);
            }
            return true;
        }, IntPtr.Zero);
        return results;
    }

    public static bool ForceForeground(IntPtr targetHwnd) {
        if (targetHwnd == IntPtr.Zero) return false;

        // 9 = SW_RESTORE, 5 = SW_SHOW
        ShowWindow(targetHwnd, 9);
        ShowWindow(targetHwnd, 5);

        IntPtr foreHwnd = GetForegroundWindow();
        uint targetProcessId;
        uint foreProcessId;
        uint targetThread = GetWindowThreadProcessId(targetHwnd, out targetProcessId);
        uint foreThread = GetWindowThreadProcessId(foreHwnd, out foreProcessId);

        if (foreThread != targetThread && targetThread != 0) {
            AttachThreadInput(foreThread, targetThread, true);
            keybd_event(0x12, 0, 0, 0); // Alt key press
            keybd_event(0x12, 0, 2, 0); // Alt key release
            SetForegroundWindow(targetHwnd);
            BringWindowToTop(targetHwnd);
            AttachThreadInput(foreThread, targetThread, false);
        } else {
            SetForegroundWindow(targetHwnd);
            BringWindowToTop(targetHwnd);
        }
        return true;
    }
}
"@ -ErrorAction Stop

# 2. Initialize Speech Recognition Engine
Add-Type -AssemblyName System.Speech -ErrorAction Stop
$engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine

$choices = New-Object System.Speech.Recognition.Choices
$choices.Add([string[]]@(
    "wake up akari",
    "wakeup akari",
    "hey akari",
    "hi akari",
    "hello akari",
    "ok akari",
    "akari wake up",
    "akari",
    "wake up aegis",
    "wake up jr sidd",
    "wake up junior sidd",
    "wake up",
    "activate akari"
))

$gb = New-Object System.Speech.Recognition.GrammarBuilder($choices)
$grammar = New-Object System.Speech.Recognition.Grammar($gb)
$grammar.Name = "AkariWakeWordGrammar"
$engine.LoadGrammar($grammar)

# Set input to system default recording device
try {
    $engine.SetInputToDefaultAudioDevice()
} catch {
    Write-Error "[WakeListener] Failed to bind to default audio device: $($_.Exception.Message)"
    exit 1
}

Write-Host "[WakeListener] Windows Background Voice Recognition initialized."
Write-Host "[WakeListener] Listening for 'Wakeup Akari' from any screen..."

# State variables for debounce
$script:lastTriggerTime = [DateTime]::MinValue
$script:debounceSeconds = 2.5

# 3. Register Speech Recognized Event Handler
Register-ObjectEvent -InputObject $engine -EventName SpeechRecognized -Action {
    param($sender, $eventArgs)

    $result = $eventArgs.Result
    if ($null -eq $result) { return }

    $phrase = $result.Text
    $confidence = [Math]::Round($result.Confidence, 3)

    $now = [DateTime]::UtcNow
    if (($now - $script:lastTriggerTime).TotalSeconds -lt $script:debounceSeconds) {
        return
    }
    $script:lastTriggerTime = $now

    Write-Host "[WAKE] phrase=$phrase confidence=$confidence"

    # Play immediate audio feedback chime through Windows sound
    try {
        [System.Media.SystemSounds]::Asterisk.Play()
    } catch {}

    # Restore and bring Akari window to front
    $found = $false
    try {
        $windows = [Win32WindowHelper]::FindAkariWindows()
        if ($windows.Count -gt 0) {
            foreach ($hwnd in $windows) {
                [Win32WindowHelper]::ForceForeground($hwnd) | Out-Null
            }
            $found = $true
        }
    } catch {
        Write-Warning "[WakeListener] Window focus error: $_"
    }

    # If no window found, trigger browser launch
    if (-not $found) {
        try {
            Start-Process "http://localhost:3000"
        } catch {}
    }

    # Notify Node server (port 3000)
    try {
        $body = @{ phrase = $phrase; confidence = $confidence; source = "windows_background" } | ConvertTo-Json
        Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/wake" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 2 -ErrorAction SilentlyContinue | Out-Null
    } catch {}

    # Notify Python agent (port 8765)
    try {
        $body = @{ phrase = $phrase; confidence = $confidence; source = "windows_background" } | ConvertTo-Json
        Invoke-RestMethod -Uri "http://127.0.0.1:8765/wake" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 2 -ErrorAction SilentlyContinue | Out-Null
    } catch {}
} | Out-Null

# 4. Start asynchronous listening in multiple recognition mode
$engine.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)

# Keep the background script alive until terminated
try {
    while ($true) {
        Start-Sleep -Seconds 1
    }
} finally {
    try {
        $engine.RecognizeAsyncStop()
        $engine.Dispose()
    } catch {}
    Write-Host "[WakeListener] Stopped."
}
