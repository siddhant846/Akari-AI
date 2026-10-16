"""
Application control: launch and close desktop applications natively on Windows OS.

Supports:
- Pre-configured shortcuts (WhatsApp, YouTube, Spotify, Discord, Telegram, Steam, VS Code, etc.)
- Dynamic Windows Start Menu & Desktop application auto-discovery
- Direct Windows Protocol / UWP Launching (whatsapp://, spotify://, etc.)
"""

from __future__ import annotations

import os
import glob
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, Optional

from ..registry import ToolError, register
from ..backends import get_backend

APP_COMMANDS: Dict[str, Dict[str, str]] = {
    # Messaging & Social
    "whatsapp": {
        "uwp": "whatsapp:",
        "exe": "WhatsApp.Root.exe",
        "image": "WhatsApp.Root.exe",
        "label": "WhatsApp",
        "linux_cmd": "whatsapp-for-linux",
        "linux_image": "whatsapp-for-linux",
    },
    "telegram": {
        "uwp": "tg:",
        "exe": "Telegram.exe",
        "image": "Telegram.exe",
        "label": "Telegram",
        "linux_cmd": "telegram-desktop",
        "linux_image": "telegram-desktop",
    },
    "discord": {
        "uwp": "discord:",
        "exe": "Discord.exe",
        "image": "Discord.exe",
        "label": "Discord",
        "linux_cmd": "discord",
        "linux_image": "Discord",
    },
    "instagram": {
        "url": "https://www.instagram.com",
        "uwp": "instagram:",
        "label": "Instagram",
        "linux_cmd": "google-chrome-stable --app=https://instagram.com",
        "linux_image": "chrome",
    },

    # Media & Entertainment
    "youtube": {
        "url": "https://www.youtube.com",
        "label": "YouTube",
        "linux_cmd": "google-chrome-stable --app=https://youtube.com",
        "linux_image": "chrome",
    },
    "spotify": {
        "uwp": "spotify:",
        "exe": "Spotify.exe",
        "image": "Spotify.exe",
        "label": "Spotify",
        "linux_cmd": "spotify",
        "linux_image": "spotify",
    },
    "netflix": {
        "url": "https://www.netflix.com",
        "uwp": "netflix:",
        "label": "Netflix",
        "linux_cmd": "google-chrome-stable --app=https://netflix.com",
        "linux_image": "chrome",
    },
    "steam": {
        "uwp": "steam://open/main",
        "exe": "steam.exe",
        "label": "Steam",
        "linux_cmd": "steam",
        "linux_image": "steam",
    },
    "vtube studio": {
        "uwp": "steam://rungameid/1325860",
        "exe": "VTube Studio.exe",
        "label": "VTube Studio",
        "linux_cmd": "steam -applaunch 1325860",
        "linux_image": "VTube Studio",
    },

    # Productivity & Coding
    "vscode": {
        "exe": "code.cmd",
        "image": "Code.exe",
        "label": "Visual Studio Code",
        "linux_cmd": "code",
        "linux_image": "code",
    },
    "notepad": {
        "exe": "notepad.exe",
        "image": "notepad.exe",
        "label": "Notepad",
        "linux_cmd": "gedit",
        "linux_image": "gedit",
    },
    "wordpad": {
        "shell": "write",
        "image": "wordpad.exe",
        "label": "WordPad",
        "linux_cmd": "abiword",
        "linux_image": "abiword",
    },
    "paint": {
        "shell": "mspaint",
        "image": "mspaint.exe",
        "label": "Paint",
        "linux_cmd": "gimp",
        "linux_image": "gimp",
    },
    "word": {
        "shell": "winword",
        "image": "WINWORD.EXE",
        "label": "Microsoft Word",
        "linux_cmd": "libreoffice --writer",
        "linux_image": "soffice.bin",
    },
    "excel": {
        "shell": "excel",
        "image": "EXCEL.EXE",
        "label": "Microsoft Excel",
        "linux_cmd": "libreoffice --calc",
        "linux_image": "soffice.bin",
    },
    "powerpoint": {
        "shell": "powerpnt",
        "image": "POWERPNT.EXE",
        "label": "Microsoft PowerPoint",
        "linux_cmd": "libreoffice --impress",
        "linux_image": "soffice.bin",
    },

    # System & Tools
    "calculator": {
        "shell": "calc",
        "image": "CalculatorApp.exe",
        "label": "Calculator",
        "linux_cmd": "gnome-calculator",
        "linux_image": "gnome-calculator",
    },
    "calc": {
        "shell": "calc",
        "image": "CalculatorApp.exe",
        "label": "Calculator",
        "linux_cmd": "gnome-calculator",
        "linux_image": "gnome-calculator",
    },
    "file explorer": {
        "shell": "explorer",
        "image": "explorer.exe",
        "label": "File Explorer",
        "linux_cmd": "nautilus",
        "linux_image": "nautilus",
    },
    "explorer": {
        "shell": "explorer",
        "image": "explorer.exe",
        "label": "File Explorer",
        "linux_cmd": "nautilus",
        "linux_image": "nautilus",
    },
    "task manager": {
        "shell": "taskmgr",
        "image": "Taskmgr.exe",
        "label": "Task Manager",
        "linux_cmd": "gnome-system-monitor",
        "linux_image": "gnome-system-monitor",
    },
    "settings": {
        "uwp": "ms-settings:",
        "image": "SystemSettings.exe",
        "label": "Settings",
        "linux_cmd": "gnome-control-center",
        "linux_image": "gnome-control-center",
    },
    "camera": {
        "uwp": "microsoft.windows.camera:",
        "image": "WindowsCamera.exe",
        "label": "Camera",
        "linux_cmd": "cheese",
        "linux_image": "cheese",
    },
    "clock": {
        "uwp": "ms-clock:",
        "image": "Time.exe",
        "label": "Clock & Alarms",
        "linux_cmd": "gnome-clocks",
        "linux_image": "gnome-clocks",
    },
    "snipping tool": {
        "uwp": "ms-screenclip:",
        "image": "ScreenClippingHost.exe",
        "label": "Snipping Tool",
        "linux_cmd": "gnome-screenshot",
        "linux_image": "gnome-screenshot",
    },
    "command prompt": {
        "exe": "cmd.exe",
        "image": "cmd.exe",
        "label": "Command Prompt",
        "linux_cmd": "gnome-terminal",
        "linux_image": "gnome-terminal-server",
    },
    "cmd": {
        "exe": "cmd.exe",
        "image": "cmd.exe",
        "label": "Command Prompt",
        "linux_cmd": "gnome-terminal",
        "linux_image": "gnome-terminal-server",
    },
    "powershell": {
        "exe": "powershell.exe",
        "image": "powershell.exe",
        "label": "PowerShell",
        "linux_cmd": "pwsh",
        "linux_image": "pwsh",
    },
    "chrome": {
        "exe": "chrome.exe",
        "image": "chrome.exe",
        "label": "Google Chrome",
        "linux_cmd": "google-chrome-stable",
        "linux_image": "chrome",
    },
    "edge": {
        "exe": "msedge.exe",
        "image": "msedge.exe",
        "label": "Microsoft Edge",
        "linux_cmd": "microsoft-edge-stable",
        "linux_image": "msedge",
    },
}

COMMON_ALIASES: Dict[str, str] = {
    "whatsaap": "whatsapp",
    "whats app": "whatsapp",
    "watsapp": "whatsapp",
    "wats app": "whatsapp",
    "wa": "whatsapp",
    "yt": "youtube",
    "you tube": "youtube",
    "spoti": "spotify",
    "music": "spotify",
    "code": "vscode",
    "visual studio code": "vscode",
    "vs code": "vscode",
    "calc": "calculator",
    "settings app": "settings",
    "file explorer": "file explorer",
    "windows explorer": "file explorer",
    "my computer": "file explorer",
    "this pc": "file explorer",
    "google chrome": "chrome",
    "microsoft edge": "edge",
    "vts": "vtube studio",
}


_SHORTCUT_CACHE: Dict[str, Optional[str]] = {}

def _find_windows_app_shortcut(query: str) -> Optional[str]:
    """Dynamically search Windows Start Menu & Desktop for any installed application .lnk shortcut."""
    if sys.platform != "win32":
        return None

    norm = query.lower().strip()
    if norm in _SHORTCUT_CACHE:
        return _SHORTCUT_CACHE[norm]
    search_dirs = [
        os.path.expandvars(r"%APPDATA%\Microsoft\Windows\Start Menu\Programs"),
        os.path.expandvars(r"%PROGRAMDATA%\Microsoft\Windows\Start Menu\Programs"),
        os.path.expandvars(r"%USERPROFILE%\Desktop"),
        os.path.expandvars(r"%PUBLIC%\Desktop"),
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WindowsApps"),
    ]

    for root_dir in search_dirs:
        if not os.path.isdir(root_dir):
            continue
        try:
            for root, _, files in os.walk(root_dir):
                for f in files:
                    base, ext = os.path.splitext(f.lower())
                    if ext in [".lnk", ".exe", ".url"]:
                        if norm == base or norm in base or base in norm:
                            res_path = os.path.join(root, f)
                            _SHORTCUT_CACHE[norm] = res_path
                            return res_path
        except Exception:
            continue

    _SHORTCUT_CACHE[norm] = None
    return None


def _resolve_app(key: str) -> Dict[str, str]:
    raw_key = (key or "").strip()
    norm = raw_key.lower()

    if norm in APP_COMMANDS:
        return APP_COMMANDS[norm]

    if norm in COMMON_ALIASES and COMMON_ALIASES[norm] in APP_COMMANDS:
        return APP_COMMANDS[COMMON_ALIASES[norm]]

    # Try dynamic Windows Start Menu shortcut discovery
    shortcut = _find_windows_app_shortcut(norm)
    if shortcut:
        return {
            "path": shortcut,
            "image": os.path.basename(shortcut),
            "label": Path(shortcut).stem,
        }

    # Fallback: Treat as direct protocol or executable
    return {
        "exe": f"{raw_key}.exe",
        "image": f"{raw_key}.exe",
        "label": raw_key,
    }


def _is_hyprland() -> bool:
    return os.environ.get("XDG_CURRENT_DESKTOP", "").lower() == "hyprland"


def _launch_hyprland(cmd: str, floating: bool, size: str = "60% 60%") -> None:
    prefix = f"[float size {size} center]" if floating else ""
    subprocess.Popen(
        f"hyprctl dispatch exec -- {prefix} {cmd}",
        shell=True,
        close_fds=True,
        start_new_session=True,
    )


@register("openApplication")
def open_application(args: Dict[str, Any]) -> Dict[str, Any]:
    """Open any desktop application natively on Windows OS."""
    name = (
        args.get("name")
        or args.get("app_name")
        or args.get("appName")
        or args.get("application")
        or args.get("app")
        or args.get("target")
        or args.get("query")
    )
    if not name:
        raise ToolError("Parameter 'name' (application name) is required.")

    spec = _resolve_app(str(name))
    floating = bool(args.get("floating", False))
    size = args.get("size", "60% 60%")
    linux_cmd = spec.get("linux_cmd")

    if floating and _is_hyprland() and linux_cmd:
        _launch_hyprland(linux_cmd, floating=True, size=size)
    else:
        # If dynamic shortcut path exists, launch directly via Windows shell
        if "path" in spec and sys.platform == "win32":
            try:
                os.startfile(spec["path"])
                return {"result": f"Opened {spec['label']} on Windows."}
            except Exception as e:
                try:
                    subprocess.Popen(["cmd.exe", "/c", "start", "", spec["path"]], shell=False)
                    return {"result": f"Opened {spec['label']} on Windows."}
                except Exception:
                    pass
        get_backend().launcher.launch(spec)

    return {"result": f"{spec['label']} opened on your computer."}


@register("closeApplication")
def close_application(args: Dict[str, Any]) -> Dict[str, Any]:
    """Close any running desktop application."""
    name = (
        args.get("name")
        or args.get("app_name")
        or args.get("appName")
        or args.get("application")
        or args.get("app")
        or args.get("target")
    )
    force = bool(args.get("force", False))
    if not name:
        raise ToolError("Parameter 'name' (application name) is required.")
    spec = _resolve_app(str(name))
    get_backend().launcher.close(spec, force)
    return {"result": f"Closed {spec['label']}."}


@register("whatsappSendMessage")
def whatsapp_send_message(args: Dict[str, Any]) -> Dict[str, Any]:
    """Open WhatsApp natively and send/type a text message to a contact name or phone number with smart disambiguation."""
    import time
    import urllib.parse

    phone = str(args.get("phone") or args.get("number") or "").strip()
    recipient = str(args.get("recipient") or args.get("contact") or args.get("name") or "").strip()
    message = str(args.get("message") or args.get("text") or "").strip()
    auto_send = args.get("auto_send", True)
    if isinstance(auto_send, str):
        auto_send = auto_send.lower() not in ["false", "0", "no"]

    # 1. SMART INTENT & INVERTED ARGUMENT DISAMBIGUATION
    GREETINGS_OR_TOPICS = {
        "goodnight", "good night", "gn", "gud nyt", "gud night", "night",
        "goodmorning", "good morning", "gm", "gud mrng", "morning",
        "hello", "hi", "hey", "bye", "goodbye", "see you", "cya",
        "happy birthday", "congratulations", "congrats", "thanks", "thank you",
    }
    
    # Clean leading conversational prefixes like 'my work', 'the office', 'to mom'
    def _clean_contact_name(name: str) -> str:
        s = name.strip()
        for prefix in ["to my ", "to the ", "my ", "the ", "to "]:
            if s.lower().startswith(prefix):
                s = s[len(prefix):].strip()
        return s

    recip_lower = recipient.lower().strip()
    msg_lower = message.lower().strip()

    # Detect if recipient was accidentally passed as the greeting/intent (e.g. recipient="goodnight", message="my work")
    if recip_lower in GREETINGS_OR_TOPICS or recip_lower.startswith("good night") or recip_lower.startswith("good morning"):
        actual_target = _clean_contact_name(message) if message else "Work"
        if not actual_target:
            actual_target = "Work"
            
        # Compose an intelligent, polished message based on greeting & recipient
        if any(g in recip_lower for g in ["goodnight", "good night", "gn"]):
            if actual_target.lower() in ["work", "office", "team", "boss", "colleagues", "group"]:
                message = "Good night everyone, signing off for the day! Have a great evening."
            elif actual_target.lower() in ["mom", "dad", "family", "mummy", "papa", "maa"]:
                message = "Good night! Sleep well and sweet dreams ❤️"
            else:
                message = f"Good night! Have a great sleep and see you tomorrow."
        elif any(g in recip_lower for g in ["goodmorning", "good morning", "gm"]):
            if actual_target.lower() in ["work", "office", "team", "boss", "colleagues", "group"]:
                message = "Good morning team! Hope everyone has a productive day ahead."
            else:
                message = "Good morning! Wishing you a wonderful day."
        else:
            message = recipient.capitalize()

        recipient = actual_target.capitalize()

    else:
        # Recipient is normal, clean contact name
        recipient = _clean_contact_name(recipient).strip()
        if recipient.islower():
            recipient = recipient.capitalize()
        
        # If message is just a bare greeting, smartly expand it if targeting work/family
        if msg_lower in GREETINGS_OR_TOPICS or msg_lower in ["goodnight", "good night", "gn"]:
            if recipient.lower() in ["work", "office", "team", "boss", "colleagues", "group"]:
                message = "Good night everyone, signing off for the day! Have a great evening."
            elif recipient.lower() in ["mom", "dad", "family", "mummy", "papa", "maa"]:
                message = "Good night! Sleep well and sweet dreams ❤️"

    # If recipient looks like a phone number, treat as phone
    clean_digits = "".join(c for c in recipient if c.isdigit() or c == "+")
    if clean_digits and len(clean_digits) >= 7 and not phone:
        phone = clean_digits
        recipient = ""

    clean_phone = "".join(c for c in phone if c.isdigit() or c == "+")

    if sys.platform == "win32":
        try:
            import pyautogui
            import pyperclip
            pyautogui.FAILSAFE = False
        except ImportError:
            pyautogui = None
            pyperclip = None

        def _ensure_whatsapp_focused() -> bool:
            try:
                import ctypes
                from ctypes import wintypes
                user32 = ctypes.windll.user32
                rect = wintypes.RECT()
                from ..backends import get_backend
                wm = get_backend().window_manager
                for _ in range(10):
                    hwnd = wm.find_window_by_title("whatsapp")
                    if hwnd:
                        wm.focus(hwnd)
                        time.sleep(0.2)
                        if user32.GetWindowRect(hwnd, ctypes.byref(rect)):
                            w = rect.right - rect.left
                            h = rect.bottom - rect.top
                            if w > 100 and h > 100 and pyautogui:
                                # Click inside WhatsApp window to ensure keyboard focus
                                cx = max(10, rect.left + min(300, w // 2))
                                cy = max(10, rect.top + min(200, h // 2))
                                pyautogui.click(cx, cy)
                        time.sleep(0.3)
                        return True
                    time.sleep(0.2)
            except Exception:
                pass
            return False

        # Case 1: Phone number provided -> use whatsapp://send URI
        if clean_phone:
            params = [f"phone={urllib.parse.quote(clean_phone)}"]
            if message:
                params.append(f"text={urllib.parse.quote(message)}")
            uri = f"whatsapp://send?{'&'.join(params)}"

            try:
                os.startfile(uri)
            except Exception:
                subprocess.Popen(["cmd.exe", "/c", "start", "", uri], shell=False)

            _ensure_whatsapp_focused()

            if auto_send and message and pyautogui:
                # Wait for WhatsApp to navigate to the chat and load the input box
                time.sleep(1.2)
                pyautogui.press("enter")
                return {"result": f"Sent WhatsApp message to {clean_phone}: '{message}'"}
            return {"result": f"Opened WhatsApp chat with {clean_phone} and prepared message."}

        # Case 2: Contact name provided -> search contact and type/send
        elif recipient:
            try:
                os.startfile("whatsapp:")
            except Exception:
                subprocess.Popen(["cmd.exe", "/c", "start", "", "whatsapp:"], shell=False)

            _ensure_whatsapp_focused()

            if pyautogui and pyperclip:
                time.sleep(0.4)
                # Clear any active dialog/field focus
                pyautogui.press("escape")
                time.sleep(0.1)
                pyautogui.press("escape")
                time.sleep(0.2)

                # Open New Chat dialog in WhatsApp (Ctrl+N) or search (Ctrl+F)
                pyautogui.hotkey("ctrl", "n")
                time.sleep(0.35)

                # Paste recipient name
                pyperclip.copy(recipient)
                pyautogui.hotkey("ctrl", "v")
                time.sleep(0.8)

                # Select the first matching contact
                pyautogui.press("down")
                time.sleep(0.15)
                pyautogui.press("enter")
                time.sleep(0.6)

                if message:
                    # Paste message into chat box
                    pyperclip.copy(message)
                    pyautogui.hotkey("ctrl", "v")
                    time.sleep(0.25)
                    if auto_send:
                        pyautogui.press("enter")
                        return {"result": f"Sent WhatsApp message to {recipient}: '{message}'"}
                    return {"result": f"Typed WhatsApp message to {recipient}: '{message}'"}
                return {"result": f"Opened WhatsApp chat with {recipient}."}

            return {"result": f"Opened WhatsApp for {recipient}."}

        # Case 3: No recipient specified -> type into current open chat
        else:
            try:
                os.startfile("whatsapp:")
            except Exception:
                subprocess.Popen(["cmd.exe", "/c", "start", "", "whatsapp:"], shell=False)

            _ensure_whatsapp_focused()

            if message and pyautogui and pyperclip:
                time.sleep(0.4)
                pyperclip.copy(message)
                pyautogui.hotkey("ctrl", "v")
                time.sleep(0.25)
                if auto_send:
                    pyautogui.press("enter")
                    return {"result": f"Sent WhatsApp message in active chat: '{message}'"}
                return {"result": f"Typed WhatsApp message: '{message}'"}

            return {"result": "Opened WhatsApp."}

    else:
        # Fallback for Linux / Web
        params = []
        if clean_phone:
            params.append(f"phone={urllib.parse.quote(clean_phone)}")
        if message:
            params.append(f"text={urllib.parse.quote(message)}")
        web_url = f"https://web.whatsapp.com/send?{'&'.join(params)}" if params else "https://web.whatsapp.com"
        import webbrowser
        webbrowser.open(web_url)
        return {"result": "Opened WhatsApp Web."}


@register("youtubeControl")
def youtube_control(args: Dict[str, Any]) -> Dict[str, Any]:
    """Control YouTube media playback (play, pause, next, prev, volume, mute, fullscreen, skip, rewind)."""
    action = (args.get("action") or "").strip().lower()
    value = args.get("value")

    # Try browserMediaControl first
    try:
        from .browser import browser_media_control
        return browser_media_control(args)
    except Exception:
        pass

    # Fallback to system keyboard / media shortcuts
    if sys.platform == "win32":
        try:
            import pyautogui
            key_map = {
                "play": "playpause",
                "pause": "playpause",
                "play_pause": "playpause",
                "mute": "volumemute",
                "unmute": "volumemute",
                "next": "nexttrack",
                "prev": "prevtrack",
                "volume_up": "volumeup",
                "volume_down": "volumedown",
                "fullscreen": "f",
                "skip": "l",
                "rewind": "j",
            }
            if action in key_map:
                pyautogui.press(key_map[action])
                return {"result": f"Sent playback control '{action}' to YouTube."}
        except Exception as e:
            raise ToolError(f"Failed to control YouTube media: {e}")

    raise ToolError(f"Action '{action}' sent. Control requires an active YouTube tab or media player.")


__all__ = [
    "open_application",
    "close_application",
    "whatsapp_send_message",
    "youtube_control",
    "APP_COMMANDS",
]

