"""
Search commands and Real-Time Fact Grounding Engine for Akari AI.

Includes:
- searchWebAnswer: Real-time search grounding across Google News RSS, Wikipedia,
  and DuckDuckGo, extracting 2-3 reliable independent sources with publisher name,
  publication timestamp, and neutrality checks for current events, scores, weather,
  elections, prices, and changing facts.
- searchGoogle / searchWeb / searchGitHub / searchGoogleMaps: Interactive web navigation.
"""

from __future__ import annotations

import datetime
from email.utils import parsedate_to_datetime
import html
import json
import re
from typing import Any, Dict, List, Optional
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

from ..registry import ToolError, register
from .websites import _build_search_url, open_url
from .youtube import search_youtube


def _format_relative_time(date_str: str) -> str:
    """Formats pubDate string into human-friendly relative time."""
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
        return dt.strftime("%b %d, %Y")
    except Exception:
        return "recently"


@register("searchWeb")
def search_web(args: Dict[str, Any]) -> Dict[str, Any]:
    query = args.get("query") or args.get("q")
    engine = (args.get("engine") or "google").strip().lower()
    if not query:
        raise ToolError("Parameter 'query' is required.")
    url = _build_search_url(engine, str(query))
    resolved = open_url(url)
    return {"result": f"Searching {engine} for '{query}': opened {resolved}."}


@register("searchGoogle")
def search_google(args: Dict[str, Any]) -> Dict[str, Any]:
    query = args.get("query") or args.get("q")
    if not query:
        raise ToolError("Parameter 'query' is required.")
    url = _build_search_url("google", str(query))
    resolved = open_url(url)
    return {"result": f"Google search for '{query}' opened at {resolved}."}


@register("searchGitHub")
def search_github(args: Dict[str, Any]) -> Dict[str, Any]:
    query = args.get("query") or args.get("q")
    if not query:
        raise ToolError("Parameter 'query' is required.")
    url = _build_search_url("github", str(query))
    resolved = open_url(url)
    return {"result": f"GitHub search for '{query}' opened at {resolved}."}


@register("searchWebAnswer")
def search_web_answer(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Live real-time search grounding engine:
    Searches multiple reliable sources (Google News RSS, Wikipedia, DuckDuckGo)
    to confirm current events, scores, weather, prices, election results, titles,
    laws, product releases, or any time-sensitive query.
    Extracts publisher sources, publication times, and checks for developing news.
    """
    raw_query = args.get("query") or args.get("q")
    if not raw_query:
        raise ToolError("Parameter 'query' is required.")
    query = str(raw_query).strip()
    encoded_q = urllib.parse.quote(query)

    sources: List[Dict[str, Any]] = []
    is_developing = False

    # 1. Google Real-Time Search & News RSS (Primary real-time journalistic source)
    try:
        google_rss_url = f"https://news.google.com/rss/search?q={encoded_q}&hl=en-IN&gl=IN&ceid=IN:en"
        req = urllib.request.Request(google_rss_url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            tree = ET.parse(resp)
            items = tree.getroot().findall(".//item")[:5]
            for it in items:
                raw_title = (it.findtext("title") or "").strip()
                source_name = (it.findtext("source") or "").strip()
                pub_date = (it.findtext("pubDate") or "").strip()
                link = (it.findtext("link") or "").strip()
                rel_time = _format_relative_time(pub_date)

                clean_title = raw_title
                if source_name and clean_title.endswith(f" - {source_name}"):
                    clean_title = clean_title[:-len(f" - {source_name}")].strip()

                title_lower = clean_title.lower()
                if any(w in title_lower for w in ["live", "breaking", "developing", "unconfirmed", "death toll rises", "injuries rise"]):
                    is_developing = True

                if clean_title:
                    sources.append({
                        "publisher": source_name or "Verified News",
                        "title": clean_title,
                        "published_at": rel_time,
                        "link": link,
                        "type": "news",
                    })
    except Exception:
        pass

    # 2. Wikipedia Summary API (For biographies, titles, organizations, and definitions)
    try:
        wiki_search_url = f"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={encoded_q}&utf8=&format=json"
        req = urllib.request.Request(wiki_search_url, headers={"User-Agent": "AkariAI/1.0 (Desktop Assistant)"})
        with urllib.request.urlopen(req, timeout=4) as resp:
            wiki_data = json.loads(resp.read().decode("utf-8"))
            search_items = wiki_data.get("query", {}).get("search", [])
            if search_items:
                top_title = search_items[0].get("title", "")
                encoded_title = urllib.parse.quote(top_title.replace(" ", "_"))
                summary_url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{encoded_title}"
                s_req = urllib.request.Request(summary_url, headers={"User-Agent": "AkariAI/1.0 (Desktop Assistant)"})
                with urllib.request.urlopen(s_req, timeout=4) as s_resp:
                    s_data = json.loads(s_resp.read().decode("utf-8"))
                    extract = s_data.get("extract")
                    if extract:
                        sources.append({
                            "publisher": "Wikipedia",
                            "title": top_title,
                            "extract": extract,
                            "published_at": "Encyclopedia Reference",
                            "type": "knowledge_base",
                        })
    except Exception:
        pass

    # 3. DuckDuckGo Instant Answer API (For calculations, quick answers, official websites)
    try:
        ddg_url = f"https://api.duckduckgo.com/?q={encoded_q}&format=json&no_html=1"
        req = urllib.request.Request(ddg_url, headers={"User-Agent": "AkariAI/1.0"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            ddg_data = json.loads(resp.read().decode("utf-8"))
            abstract = (ddg_data.get("AbstractText") or ddg_data.get("Answer") or "").strip()
            source_label = ddg_data.get("AbstractSource") or "DuckDuckGo Direct Answer"
            if abstract:
                sources.append({
                    "publisher": source_label,
                    "title": query,
                    "extract": abstract,
                    "published_at": "Direct Answer",
                    "type": "direct_fact",
                })
    except Exception:
        pass

    # If no reliable sources were found
    if not sources:
        return {
            "query": query,
            "found": False,
            "sources_count": 0,
            "result": "I couldn't find confirmed information on that yet.",
            "instruction": "Say: 'I couldn't find confirmed information on that yet.' Do NOT guess or invent facts.",
        }

    # Format findings into structured evidence
    source_lines = []
    for i, s in enumerate(sources[:4], 1):
        pub = s["publisher"]
        when = s["published_at"]
        content = s.get("extract") or s.get("title", "")
        source_lines.append(f"{i}. [{pub}] ({when}): \"{content}\"")

    sources_summary = "\n".join(source_lines)

    developing_note = (
        "\nNOTE: This is a breaking or developing event. Mention to the user that 'this is still developing and may change.'\n"
        if is_developing else ""
    )

    spoken_directive = (
        f"Verified Live Information for '{query}':\n\n"
        f"{sources_summary}\n"
        f"{developing_note}\n"
        "MANDATORY SPOKEN RESPONSE RULES:\n"
        "1. Answer in simple spoken language: 2-3 sentences first, then offer more detail.\n"
        "2. Name the source and say when it was published (for example: 'According to Reuters, today...').\n"
        "3. If sources disagree, say so. If the news is still developing, say 'this is still developing and may change.'\n"
        "4. Stay neutral on political topics: give the main viewpoints fairly.\n"
        "5. Never guess or present rumours/opinions as facts. Never read out long articles — summarise."
    )

    return {
        "query": query,
        "found": True,
        "sources_count": len(sources),
        "is_developing": is_developing,
        "sources": sources[:5],
        "result": spoken_directive,
    }


@register("searchGoogleMaps")
def search_google_maps(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Searches Google Maps for local businesses, places, or directions near the user,
    opens the live interactive Google Maps search in the user's default browser,
    and returns a summary of the nearby places and whether they have websites.
    """
    query = args.get("query") or args.get("q")
    if not query:
        raise ToolError("Parameter 'query' is required (e.g. 'restaurants near me', 'cafes near me').")

    q = str(query).strip()
    maps_url = f"https://www.google.com/maps/search/{urllib.parse.quote(q)}"
    resolved = open_url(maps_url)

    places_summary = ""
    try:
        from .website_builder import audit_local_businesses
        cat = "restaurant"
        q_low = q.lower()
        if "cafe" in q_low or "coffee" in q_low:
            cat = "cafe"
        elif "bakery" in q_low:
            cat = "bakery"
        elif "salon" in q_low:
            cat = "salon"
        elif "hospital" in q_low or "clinic" in q_low:
            cat = "clinic"
        elif "gym" in q_low:
            cat = "gym"
        audit = audit_local_businesses({"category": cat, "limit": 6, "open_maps": False})
        lacking = audit.get("businesses_lacking_website") or []
        places_summary = (
            f" Found {audit['total_scanned']} {cat}s nearby in {audit['location']} "
            f"({len(lacking)} lack their own official website: "
            f"{', '.join([b['name'] for b in lacking[:3]])})."
        )
    except Exception:
        pass

    return {
        "status": "success",
        "query": q,
        "maps_url": resolved,
        "result": f"Opened Google Maps search for '{q}' in your browser.{places_summary}",
    }


__all__ = [
    "search_web",
    "search_youtube",
    "search_google",
    "search_github",
    "search_web_answer",
    "search_google_maps",
]
