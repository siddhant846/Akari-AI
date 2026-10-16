from .base import WindowManager, AudioController, ClipboardManager, ScreenshotManager, ApplicationLauncher, TerminalManager, OSBackend
from typing import Any, Dict, Optional, Tuple
import os
import io
import time
import subprocess
import shutil

class WindowsWindowManager(WindowManager):
    def _get_interactive_desktop_windows(self):
        import ctypes
        user32 = ctypes.windll.user32
        winsta = user32.OpenWindowStationW("WinSta0", False, 0x10000000)
        if winsta:
            user32.SetProcessWindowStation(winsta)
        desk = user32.OpenDesktopW("Default", 0, False, 0x10000000)

        titles = []
        CMP = ctypes.WINFUNCTYPE(ctypes.c_int, ctypes.c_void_p, ctypes.c_void_p)
        def cb(hwnd, _):
            length = user32.GetWindowTextLengthW(hwnd)
            if length > 0:
                buf = ctypes.create_unicode_buffer(length + 1)
                user32.GetWindowTextW(hwnd, buf, length + 1)
                t = buf.value.strip()
                if t:
                    is_vis = bool(user32.IsWindowVisible(hwnd))
                    titles.append((hwnd, t, is_vis))
            return 1

        if desk:
            user32.EnumDesktopWindows(desk, CMP(cb), 0)
        else:
            user32.EnumWindows(CMP(cb), 0)
        return titles

    def get_foreground_window(self) -> Any:
        try:
            import ctypes
            hwnd = ctypes.windll.user32.GetForegroundWindow()
            return hwnd if hwnd else None
        except Exception:
            return None

    def get_window_title(self, hwnd: Any) -> str:
        try:
            import ctypes
            length = ctypes.windll.user32.GetWindowTextLengthW(hwnd)
            if length > 0:
                buf = ctypes.create_unicode_buffer(length + 1)
                ctypes.windll.user32.GetWindowTextW(hwnd, buf, length + 1)
                return buf.value
            return ""
        except Exception:
            return ""

    def show_window(self, hwnd: Any, cmd: int) -> None:
        try:
            import ctypes
            ctypes.windll.user32.ShowWindow(hwnd, cmd)
        except Exception:
            pass

    def close_window(self, hwnd: Any) -> None:
        try:
            import ctypes
            ctypes.windll.user32.PostMessageW(hwnd, 0x0010, 0, 0)
        except Exception:
            pass

    def find_window_by_title(self, query: str) -> Any:
        try:
            q = query.lower().strip()
            windows = self._get_interactive_desktop_windows()
            
            # Filter internal helper windows
            filtered = [(h, t, vis) for h, t, vis in windows if not any(x in t for x in ["GDI+", "Default IME", "MSCTFIME", "DesktopWindowXamlSource"])]

            # 1. Exact or visible match first
            for h, t, vis in filtered:
                if q in t.lower() and vis:
                    return h

            # 2. Match background or minimized window
            for h, t, vis in filtered:
                if q in t.lower():
                    return h
            return None
        except Exception:
            return None

    def focus(self, hwnd: Any) -> None:
        try:
            import ctypes
            user32 = ctypes.windll.user32
            # Restore window if minimized
            user32.ShowWindow(hwnd, 9) # SW_RESTORE
            time.sleep(0.05)

            # Bypass Windows foreground lock using AttachThreadInput
            current_thread = ctypes.windll.kernel32.GetCurrentThreadId()
            fg_hwnd = user32.GetForegroundWindow()
            fg_thread = user32.GetWindowThreadProcessId(fg_hwnd, None) if fg_hwnd else None
            target_thread = user32.GetWindowThreadProcessId(hwnd, None)

            if fg_thread and fg_thread != current_thread:
                user32.AttachThreadInput(current_thread, fg_thread, True)
            if target_thread and target_thread != current_thread:
                user32.AttachThreadInput(current_thread, target_thread, True)

            user32.BringWindowToTop(hwnd)
            user32.SetForegroundWindow(hwnd)

            if fg_thread and fg_thread != current_thread:
                user32.AttachThreadInput(current_thread, fg_thread, False)
            if target_thread and target_thread != current_thread:
                user32.AttachThreadInput(current_thread, target_thread, False)
        except Exception:
            pass


class WindowsAudioController(AudioController):
    def _init_pycaw(self):
        try:
            from ctypes import cast, POINTER
            import comtypes
            from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume
            devices = AudioUtilities.GetSpeakers()
            interface = devices.Activate(IAudioEndpointVolume._iid_, comtypes.CLSCTX_ALL, None)
            return cast(interface, POINTER(IAudioEndpointVolume))
        except Exception:
            return None

    def get_volume(self) -> float:
        iface = self._init_pycaw()
        if iface:
            try:
                return float(iface.GetMasterVolumeLevelScalar())
            except Exception:
                pass
        return 0.5

    def set_volume(self, value: float) -> None:
        iface = self._init_pycaw()
        if iface:
            try:
                iface.SetMasterVolumeLevelScalar(value, None)
            except Exception:
                pass

    def toggle_mute(self) -> bool:
        iface = self._init_pycaw()
        if iface:
            try:
                current = bool(iface.GetMute())
                iface.SetMute(1 if not current else 0, None)
                return not current
            except Exception:
                pass
        return False


class WindowsClipboardManager(ClipboardManager):
    def copy(self) -> None:
        try:
            import pyautogui
            pyautogui.hotkey("ctrl", "c")
        except Exception:
            pass

    def paste(self) -> None:
        try:
            import pyautogui
            pyautogui.hotkey("ctrl", "v")
        except Exception:
            pass

    def read(self) -> str:
        try:
            import pyperclip
            return pyperclip.paste() or ""
        except Exception:
            return ""

    def write(self, text: str) -> None:
        try:
            import pyperclip
            pyperclip.copy(text)
        except Exception:
            pass


class WindowsScreenshotManager(ScreenshotManager):
    def _gdi_capture(self, x: int = 0, y: int = 0, w: int = 0, h: int = 0) -> Any:
        import ctypes
        from ctypes import wintypes
        from PIL import Image

        user32 = ctypes.windll.user32
        gdi32 = ctypes.windll.gdi32

        if w <= 0:
            w = user32.GetSystemMetrics(0)
        if h <= 0:
            h = user32.GetSystemMetrics(1)

        hdc_screen = user32.GetDC(0)
        hdc_mem = gdi32.CreateCompatibleDC(hdc_screen)
        hbmp = gdi32.CreateCompatibleBitmap(hdc_screen, w, h)
        gdi32.SelectObject(hdc_mem, hbmp)
        gdi32.BitBlt(hdc_mem, 0, 0, w, h, hdc_screen, x, y, 0x00CC0020)

        class BITMAPINFOHEADER(ctypes.Structure):
            _fields_ = [
                ("biSize", wintypes.DWORD),
                ("biWidth", wintypes.LONG),
                ("biHeight", wintypes.LONG),
                ("biPlanes", wintypes.WORD),
                ("biBitCount", wintypes.WORD),
                ("biCompression", wintypes.DWORD),
                ("biSizeImage", wintypes.DWORD),
                ("biXPelsPerMeter", wintypes.LONG),
                ("biYPelsPerMeter", wintypes.LONG),
                ("biClrUsed", wintypes.DWORD),
                ("biClrImportant", wintypes.DWORD),
            ]

        bmi = BITMAPINFOHEADER()
        bmi.biSize = ctypes.sizeof(BITMAPINFOHEADER)
        bmi.biWidth = w
        bmi.biHeight = -h
        bmi.biPlanes = 1
        bmi.biBitCount = 32
        bmi.biCompression = 0

        buf = ctypes.create_string_buffer(w * h * 4)
        gdi32.GetDIBits(hdc_mem, hbmp, 0, h, buf, ctypes.byref(bmi), 0)

        gdi32.DeleteObject(hbmp)
        gdi32.DeleteDC(hdc_mem)
        user32.ReleaseDC(0, hdc_screen)

        return Image.frombuffer("RGBA", (w, h), buf, "raw", "BGRA", 0, 1)

    def capture(self) -> Any:
        try:
            return self._gdi_capture()
        except Exception:
            try:
                from PIL import ImageGrab
                return ImageGrab.grab()
            except Exception as e:
                raise Exception(f"Screen capture failed: {e}")

    def capture_region(self, bbox: Tuple[int, int, int, int]) -> Any:
        try:
            x1, y1, x2, y2 = bbox
            w = max(1, x2 - x1)
            h = max(1, y2 - y1)
            return self._gdi_capture(x1, y1, w, h)
        except Exception:
            try:
                from PIL import ImageGrab
                return ImageGrab.grab(bbox=bbox)
            except Exception as e:
                raise Exception(f"Region capture failed: {e}")

    def active_window_bbox(self) -> Optional[Tuple[int, int, int, int]]:
        try:
            import win32gui
            hwnd = win32gui.GetForegroundWindow()
            if not hwnd: return None
            return win32gui.GetWindowRect(hwnd)
        except Exception:
            return None


class WindowsApplicationLauncher(ApplicationLauncher):
    def launch(self, spec: Dict[str, str]) -> None:
        import webbrowser
        if "url" in spec:
            url = spec["url"]
            try:
                os.startfile(url)
                return
            except Exception:
                webbrowser.open(url)
                return
        if "path" in spec:
            target = spec["path"]
            try:
                os.startfile(target)
                return
            except Exception:
                subprocess.Popen(["cmd.exe", "/c", "start", "", target], shell=False)
                return
        if "uwp" in spec:
            uwp_uri = spec["uwp"]
            try:
                os.startfile(uwp_uri)
                return
            except Exception:
                if "url" in spec:
                    webbrowser.open(spec["url"])
                    return
                subprocess.Popen(["cmd.exe", "/c", "start", "", uwp_uri], shell=False)
                return
        if "exe" in spec:
            exe = spec["exe"]
            try:
                os.startfile(exe)
                return
            except Exception:
                pass
            subprocess.Popen(["cmd.exe", "/c", "start", "", exe], shell=False)
            return
        if "shell" in spec:
            shell_cmd = spec["shell"]
            try:
                subprocess.Popen(["cmd.exe", "/c", shell_cmd], shell=False)
            except Exception:
                os.system(f"start {shell_cmd}")
            return

    def close(self, spec: Dict[str, str], force: bool) -> None:
        image = spec.get("image") or spec.get("exe")
        if not image:
            return
        force_flag = " /F" if force else ""
        subprocess.run(f'taskkill /IM "{image}"{force_flag}', shell=True, capture_output=True, timeout=10)
        time.sleep(0.2)

class WindowsTerminalManager(TerminalManager):
    def run_command(self, command: str) -> str:
        res = subprocess.run(command, shell=True, capture_output=True, text=True)
        return res.stdout + res.stderr

    def install_package(self, package: str) -> str:
        return "Package installation not supported on Windows terminal manager."

class WindowsBackend(OSBackend):
    def __init__(self):
        self.window_manager = WindowsWindowManager()
        self.audio = WindowsAudioController()
        self.clipboard = WindowsClipboardManager()
        self.screenshot = WindowsScreenshotManager()
        self.launcher = WindowsApplicationLauncher()
        self.terminal = WindowsTerminalManager()
