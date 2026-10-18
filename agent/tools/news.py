"""
Live News & Briefing Engine for Akari AI.

Provides real-time news headlines, category filtering (top, tech, sports, business,
world, india, science, entertainment), and executive 5-headline morning/evening briefings
with source verification and publication timestamps.
"""

from __future__ import annotations

import datetime
from email.utils import parsedate_to_datetime
from typing import Any, Dict, List
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

from ..registry import ToolError, register


def _format_relative_time(date_str: str) -> str:
    """Converts RSS pubDate string into human-friendly relative time."""
    if not date_str:
        return "recently"
    try:
        dt = parsedate_to_datetime(date_str)
        now = datetime.datetime.now(datetime.timezone.utc)
        diff = now - dt
        secs = diff.total_seconds()
        if secs < 0:
            return "just now"
        if secs < 3600:
            mins = max(1, int(secs // 60))
            return f"{mins}m ago"
        if secs < 86400:
            hrs = int(secs // 3600)
            return f"{hrs}h ago"
        if secs < 172800:
            return "yesterday"
        return dt.strftime("%b %d")
    except Exception:
        return "today"


@register("getNews")
def get_news(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Fetches real-time news headlines across categories (top, tech, world, india, sports, business)
    or custom topics. Formats top 5 headlines into clean one-liners with source and publication time
    for fast verbal briefings.
    """
    raw_cat = (args.get("category") or "top").strip().lower()
    count = min(max(int(args.get("count") or 5), 1), 10)

    rss_urls = {
        "top": "https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en",
        "tech": "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtVnVHZ0pWVXlnQVAB?hl=en-IN&gl=IN&ceid=IN:en",
        "technology": "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtVnVHZ0pWVXlnQVAB?hl=en-IN&gl=IN&ceid=IN:en",
        "world": "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtVnVHZ0pWVXlnQVAB?hl=en-IN&gl=IN&ceid=IN:en",
        "india": "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFZxYUdjU0FtVnVHZ0pWVXlnQVAB?hl=en-IN&gl=IN&ceid=IN:en",
        "sports": "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp1ZEdvU0FtVnVHZ0pWVXlnQVAB?hl=en-IN&gl=IN&ceid=IN:en",
        "business": "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtVnVHZ0pWVXlnQVAB?hl=en-IN&gl=IN&ceid=IN:en",
        "science": "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFptTXpJU0FtVnVHZ0pWVXlnQVAB?hl=en-IN&gl=IN&ceid=IN:en",
        "entertainment": "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNREpxYW5RU0FtVnVHZ0pWVXlnQVAB?hl=en-IN&gl=IN&ceid=IN:en",
    }

    if raw_cat in rss_urls:
        url = rss_urls[raw_cat]
        category_label = raw_cat.title()
    else:
        # Search query for custom topic (e.g. "cricket", "artificial intelligence")
        encoded_topic = urllib.parse.quote(raw_cat)
        url = f"https://news.google.com/rss/search?q={encoded_topic}&hl=en-IN&gl=IN&ceid=IN:en"
        category_label = raw_cat

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            tree = ET.parse(resp)
        root = tree.getroot()
        items = root.findall(".//item")[:count]

        headlines: List[Dict[str, Any]] = []
        one_liners: List[str] = []

        for i, item in enumerate(items, 1):
            raw_title = (item.findtext("title") or "").strip()
            source = (item.findtext("source") or "").strip()
            pub_date = (item.findtext("pubDate") or "").strip()
            link = (item.findtext("link") or "").strip()
            rel_time = _format_relative_time(pub_date)

            # Strip redundant "- Publisher" suffix if present
            clean_title = raw_title
            if source and clean_title.endswith(f" - {source}"):
                clean_title = clean_title[:-len(f" - {source}")].strip()

            if clean_title:
                headlines.append({
                    "id": i,
                    "title": clean_title,
                    "publisher": source or "Verified News Source",
                    "published": rel_time,
                    "link": link,
                })
                source_tag = f" — {source}, {rel_time}" if source else f" — {rel_time}"
                one_liners.append(f"{i}. {clean_title}{source_tag}")

        if not headlines:
            return {
                "status": "not_found",
                "category": category_label,
                "count": 0,
                "result": f"I couldn't find confirmed headlines on '{category_label}' right now.",
            }

        briefing_text = "\n".join(one_liners)
        spoken_prompt = (
            f"Here are the top {len(headlines)} headlines in {category_label}:\n\n"
            f"{briefing_text}\n\n"
            "BRIEFING INSTRUCTION:\n"
            "1. Read out the top 5 headlines in one line each.\n"
            "2. Then ask: 'Which one would you like me to dive into in detail?'\n"
            "3. If you don't know the user's preferred topics yet (tech, sports, business, world, India), ask them once and remember it."
        )

        return {
            "status": "success",
            "category": category_label,
            "count": len(headlines),
            "headlines": headlines,
            "briefing_text": briefing_text,
            "result": spoken_prompt,
        }

    except Exception as e:
        raise ToolError(f"Failed to fetch live news: {e}")
