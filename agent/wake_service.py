"""
Akari AI — Windows Background Wake Word Service (Python Supervisor)

Supervises the native Windows SpeechRecognitionEngine background process (wake_listener.ps1)
and ensures Akari awakens and unminimizes whenever "Wakeup Akari" is spoken aloud,
regardless of which screen or application is active.
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any, Dict, Optional
import urllib.request

log = logging.getLogger("akari.wake_service")

ROOT_DIR = Path(__file__).resolve().parent.parent
LISTENER_SCRIPT = ROOT_DIR / "agent" / "wake_listener.ps1"
SETTINGS_FILE = ROOT_DIR / "settings.json"


class WakeWordService:
    def __init__(self):
        self._process: Optional[subprocess.Popen] = None
        self._thread: Optional[threading.Thread] = None
        self._running = False
        self._last_trigger = 0.0
        self._debounce_sec = 2.5
        self._lock = threading.Lock()

    def is_enabled_in_settings(self) -> bool:
        try:
            if SETTINGS_FILE.exists():
                with open(SETTINGS_FILE, "r", encoding="utf-8") as fh:
                    data = json.load(fh)
                    return bool(data.get("wakeWordEnabled", True))
        except Exception:
            pass
        return True

    def start(self) -> bool:
        with self._lock:
            if self._running and self._process and self._process.poll() is None:
                log.info("Wake word service is already running.")
                return True

            if not self.is_enabled_in_settings():
                log.info("Wake word detection is disabled in settings.json.")
                return False

            if not LISTENER_SCRIPT.exists():
                log.error("Wake listener script not found: %s", LISTENER_SCRIPT)
                return False

            cmd = [
                "powershell.exe",
                "-NoProfile",
                "-ExecutionPolicy", "Bypass",
                "-WindowStyle", "Hidden",
                "-File", str(LISTENER_SCRIPT),
            ]

            try:
                log.info("Starting native Windows background wake-word listener...")
                self._process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    bufsize=1,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000),
                )
                self._running = True

                self._thread = threading.Thread(target=self._monitor_output, daemon=True)
                self._thread.start()
                log.info("Native Windows background wake-word listener successfully started.")
                return True
            except Exception as e:
                log.exception("Failed to launch background wake listener: %s", e)
                self._running = False
                return False

    def stop(self) -> None:
        with self._lock:
            self._running = False
            if self._process:
                try:
                    log.info("Terminating background wake listener process...")
                    self._process.terminate()
                    self._process.wait(timeout=2)
                except Exception:
                    try:
                        self._process.kill()
                    except Exception:
                        pass
                self._process = None
            log.info("Background wake listener stopped.")

    def _monitor_output(self) -> None:
        proc = self._process
        if not proc or not proc.stdout:
            return

        for line in iter(proc.stdout.readline, ""):
            if not self._running:
                break
            line_str = line.strip()
            if not line_str:
                continue

            try:
                clean_str = line_str.encode("ascii", "replace").decode("ascii")
                log.info("[WakeListener] %s", clean_str)
            except Exception:
                pass

            if "[WAKE]" in line_str:
                phrase = "wake up akari"
                confidence = 0.9
                try:
                    parts = line_str.split()
                    for p in parts:
                        if p.startswith("phrase="):
                            phrase = p.split("=", 1)[1].strip('"')
                        elif p.startswith("confidence="):
                            confidence = float(p.split("=", 1)[1])
                except Exception:
                    pass

                self.trigger_wake(phrase, confidence, source="windows_speech_engine")

        proc.stdout.close()
        if self._running:
            log.warning("Wake listener exited unexpectedly. Will attempt restart in 5s...")
            time.sleep(5)
            if self._running:
                self.start()

    def trigger_wake(self, phrase: str = "wake up akari", confidence: float = 0.9, source: str = "system") -> None:
        now = time.time()
        if now - self._last_trigger < self._debounce_sec:
            return
        self._last_trigger = now

        log.info("⚡ WAKE WORD TRIGGERED! Phrase: '%s' (confidence: %.2f)", phrase, confidence)

        # 1. Bring Akari window to front
        self.bring_akari_to_front()

        # 2. Notify Node.js server (port 3000)
        self._notify_node_server(phrase, confidence, source)

    def bring_akari_to_front(self) -> bool:
        """Finds any Akari window, restores it from minimized state, and brings it to foreground."""
        try:
            import win32gui
            import win32con
            import win32process
            import ctypes

            user32 = ctypes.windll.user32
            found_hwnds = []

            def enum_cb(h, _):
                if win32gui.IsWindow(h):
                    title = win32gui.GetWindowText(h).lower()
                    if title and (
                        "akari" in title
                        or "localhost:3000" in title
                        or "127.0.0.1:3000" in title
                        or "desktop assistant" in title
                    ):
                        found_hwnds.append(h)
                return True

            win32gui.EnumWindows(enum_cb, None)

            if not found_hwnds:
                log.info("No active Akari window found to focus. Opening browser...")
                try:
                    import webbrowser
                    webbrowser.open("http://localhost:3000")
                except Exception:
                    pass
                return False

            for hwnd in found_hwnds:
                try:
                    # Restore window if minimized
                    if win32gui.IsIconic(hwnd):
                        win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
                    win32gui.ShowWindow(hwnd, win32con.SW_SHOW)

                    fore_hwnd = win32gui.GetForegroundWindow()
                    curr_tid = win32process.GetCurrentThreadId()
                    fore_tid = win32process.GetWindowThreadProcessId(fore_hwnd)[0] if fore_hwnd else 0
                    target_tid = win32process.GetWindowThreadProcessId(hwnd)[0]

                    # Bypass Windows focus-stealing lock
                    if fore_tid and fore_tid != target_tid:
                        user32.AttachThreadInput(fore_tid, target_tid, True)
                        user32.keybd_event(0x12, 0, 0, 0) # Alt down
                        user32.keybd_event(0x12, 0, 2, 0) # Alt up
                        win32gui.SetForegroundWindow(hwnd)
                        win32gui.BringWindowToTop(hwnd)
                        user32.AttachThreadInput(fore_tid, target_tid, False)
                    else:
                        win32gui.SetForegroundWindow(hwnd)
                        win32gui.BringWindowToTop(hwnd)

                    log.info("Brought Akari window (HWND: %s) to foreground.", hwnd)
                except Exception as e:
                    log.warning("Could not focus HWND %s: %s", hwnd, e)

            return True
        except Exception as e:
            log.warning("Win32 window focus exception: %s", e)
            return False

    def _notify_node_server(self, phrase: str, confidence: float, source: str) -> None:
        def _post():
            try:
                url = "http://127.0.0.1:3000/api/wake"
                payload = json.dumps({
                    "phrase": phrase,
                    "confidence": confidence,
                    "source": source,
                    "timestamp": int(time.time() * 1000)
                }).encode("utf-8")
                req = urllib.request.Request(
                    url,
                    data=payload,
                    headers={"Content-Type": "application/json"},
                    method="POST"
                )
                with urllib.request.urlopen(req, timeout=2.0) as resp:
                    pass
            except Exception:
                pass

        threading.Thread(target=_post, daemon=True).start()

    def get_status(self) -> Dict[str, Any]:
        is_active = self._running and (self._process is not None) and (self._process.poll() is None)
        return {
            "running": is_active,
            "pid": self._process.pid if is_active else None,
            "enabled": self.is_enabled_in_settings(),
            "lastTrigger": self._last_trigger,
        }


# Global singleton instance
wake_service = WakeWordService()
