"""
YouTube search, video selection, direct playback, and media control.
"""

from __future__ import annotations

import json
import os
import platform
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import webbrowser
from typing import Any, Dict, List, Optional

from ..registry import ToolError, register

# Cache last search results in memory for instant "select video 2", "play first video", etc.
_LAST_YOUTUBE_RESULTS: List[Dict[str, str]] = []
_LAST_YOUTUBE_QUERY: str = ""


def _fetch_youtube_search_results(query: str, limit: int = 10) -> List[Dict[str, str]]:
    """Scrape and parse YouTube search results for clean video metadata with local proxy & fast fallback."""
    global _LAST_YOUTUBE_RESULTS, _LAST_YOUTUBE_QUERY
    
    clean_q = query.strip()
    videos: List[Dict[str, str]] = []

    # 1. First try the local Node proxy (which bypasses bot detection and runs in ~500ms)
    try:
        local_url = f"http://127.0.0.1:3000/api/youtube-search?q={urllib.parse.quote(clean_q)}"
        req = urllib.request.Request(local_url, headers={"User-Agent": "AkariDesktop/1.0"})
        with urllib.request.urlopen(req, timeout=2.5) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="ignore"))
            raw_results = data.get("results", [])
            for r in raw_results:
                vid = r.get("videoId")
                if vid:
                    videos.append({
                        "video_id": vid,
                        "title": r.get("title") or f"YouTube Video ({vid})",
                        "author": r.get("author") or "YouTube Creator",
                        "duration": r.get("duration") or "",
                        "views": r.get("views") or "",
                        "url": f"https://www.youtube.com/watch?v={vid}",
                    })
    except Exception:
        videos = []

    # 2. If local proxy returned nothing, try fast scrape with 2s timeout
    if not videos:
        search_url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(clean_q)}&hl=en"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
        }
        try:
            req = urllib.request.Request(search_url, headers=headers)
            with urllib.request.urlopen(req, timeout=2.0) as resp:
                html = resp.read().decode("utf-8", errors="ignore")
                ids = list(dict.fromkeys(re.findall(r'watch\?v=([a-zA-Z0-9_-]{11})', html)))
                for vid in ids[:limit]:
                    videos.append({
                        "video_id": vid,
                        "title": f"Video ({vid})",
                        "author": "YouTube Creator",
                        "duration": "",
                        "views": "",
                        "url": f"https://www.youtube.com/watch?v={vid}",
                    })
        except Exception:
            pass

    if videos:
        _LAST_YOUTUBE_RESULTS = videos[:limit]
        _LAST_YOUTUBE_QUERY = clean_q

    return videos[:limit]


def _open_video_url(url: str) -> None:
    """Open YouTube video URL in user default browser and bring browser to front."""
    if platform.system() == "Windows":
        try:
            os.startfile(url)
        except Exception:
            try:
                webbrowser.open(url)
            except Exception:
                subprocess.Popen(["cmd.exe", "/c", "start", "", url], shell=False)
        try:
            from ..backends import get_backend
            wm = get_backend().window_manager
            time.sleep(0.15)
            for b_name in ["chrome", "msedge", "edge", "firefox", "brave"]:
                h = wm.find_window_by_title(b_name)
                if h:
                    wm.focus(h)
                    break
        except Exception:
            pass
        return

    try:
        webbrowser.open(url)
    except Exception:
        subprocess.Popen(["xdg-open", url])


@register("searchYouTube")
def search_youtube(args: Dict[str, Any]) -> Dict[str, Any]:
    """Search YouTube, open search results, and return top video options with index numbers."""
    query = args.get("query") or args.get("q")
    if not query:
        raise ToolError("Parameter 'query' is required.")

    query_str = str(query).strip()
    search_url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(query_str)}"
    _open_video_url(search_url)
    videos = _fetch_youtube_search_results(query_str, limit=5)

    if videos:
        lines = [f"{i}. {v['title']} ({v['author']})" for i, v in enumerate(videos, 1)]
        summary = "\n".join(lines)
        return {
            "result": f"Searched YouTube for '{query_str}'. Top results:\n{summary}\n\nTo play any video, call selectYouTubeVideo(index=1) or playYouTubeVideo.",
            "query": query_str,
            "videos": videos,
            "url": search_url,
        }

    return {
        "result": f"Opened YouTube search for '{query_str}'.",
        "query": query_str,
        "url": search_url,
    }


@register("playYouTubeVideo")
def play_youtube_video(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Directly search and play a specific YouTube video or song in the browser.
    Can accept a search query, video index, direct URL, or video ID.
    """
    query: Optional[str] = args.get("query") or args.get("q") or args.get("title")
    index: Optional[int] = args.get("index") or args.get("number")
    url: Optional[str] = args.get("url")
    video_id: Optional[str] = args.get("video_id") or args.get("videoId")

    # 1. Direct URL / ID
    if url:
        _open_video_url(url)
        return {"result": f"Playing YouTube video: {url}", "url": url}

    if video_id:
        watch_url = f"https://www.youtube.com/watch?v={video_id}"
        _open_video_url(watch_url)
        return {"result": f"Playing YouTube video ID {video_id}", "url": watch_url, "video_id": video_id}

    # 2. Select from previous search by index if no new query
    if not query and _LAST_YOUTUBE_RESULTS:
        idx = (int(index) - 1) if index else 0
        idx = max(0, min(idx, len(_LAST_YOUTUBE_RESULTS) - 1))
        chosen = _LAST_YOUTUBE_RESULTS[idx]
        _open_video_url(chosen["url"])
        return {
            "result": f"Playing video #{idx + 1}: '{chosen['title']}' by {chosen['author']}.",
            "title": chosen["title"],
            "url": chosen["url"],
            "video_id": chosen["video_id"],
        }

    # 3. Query YouTube directly and play the best match
    query_str = str(query).strip() if query else (_LAST_YOUTUBE_QUERY or "lofi beats")
    videos = _fetch_youtube_search_results(query_str, limit=5)

    if not videos:
        direct_url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(query_str)}"
        _open_video_url(direct_url)
        return {"result": f"Searching and opening YouTube for '{query_str}'.", "url": direct_url}

    target_idx = (int(index) - 1) if index and 1 <= int(index) <= len(videos) else 0
    selected = videos[target_idx]
    _open_video_url(selected["url"])

    return {
        "result": f"Now playing '{selected['title']}' by {selected['author']} on YouTube.",
        "title": selected["title"],
        "author": selected["author"],
        "url": selected["url"],
        "video_id": selected["video_id"],
    }


@register("selectYouTubeVideo")
@register("clickYouTubeVideo")
@register("playEpisode")
def select_youtube_video(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Select and immediately click/play a specific video or episode from YouTube search results by index or title.
    """
    index = args.get("index") or args.get("number") or args.get("episode") or 1
    query = args.get("query") or args.get("title")

    try:
        idx = int(index)
    except Exception:
        idx = 1

    # If previous search exists, pick from it
    if _LAST_YOUTUBE_RESULTS:
        target_idx = max(0, min(idx - 1, len(_LAST_YOUTUBE_RESULTS) - 1))
        chosen = _LAST_YOUTUBE_RESULTS[target_idx]
        _open_video_url(chosen["url"])
        return {
            "result": f"Selected and playing episode #{target_idx + 1}: '{chosen['title']}' by {chosen['author']}.",
            "title": chosen["title"],
            "url": chosen["url"],
            "video_id": chosen["video_id"],
        }

    # If no cached search, or user provided title/query, perform query
    search_term = str(query).strip() if query else (_LAST_YOUTUBE_QUERY or "lofi music")
    return play_youtube_video({"query": search_term, "index": idx})


@register("youtubeControl")
def youtube_control(args: Dict[str, Any]) -> Dict[str, Any]:
    """Control YouTube media playback (play, pause, next, prev, volume, mute, fullscreen, skip, rewind)."""
    action = (args.get("action") or "").strip().lower()

    # Try browserMediaControl first
    try:
        from .browser import browser_media_control
        return browser_media_control(args)
    except Exception:
        pass

    # Windows media keys and hotkeys
    if platform.system() == "Windows":
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

    return {"result": f"Sent '{action}' command to YouTube."}


__all__ = [
    "search_youtube",
    "play_youtube_video",
    "select_youtube_video",
    "youtube_control",
]
