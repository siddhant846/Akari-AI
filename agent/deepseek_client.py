"""
DeepSeek AI Client for Akari AI.

Provides seamless integration with DeepSeek LLMs (deepseek-chat, deepseek-reasoner,
deepseek-v4-pro:0813) for PowerPoint slide synthesis, document authoring, deep code
generation, and contextual reasoning.
"""

from __future__ import annotations

import os
import re
import json
import urllib.request
import urllib.error
from pathlib import Path
from typing import Any, Dict, List, Optional

HOME = Path(os.environ.get("USERPROFILE") or os.environ.get("HOME") or ".")


def get_deepseek_config() -> Dict[str, str]:
    """Retrieve DeepSeek API key, model, and base URL from all available sources."""
    api_key = os.environ.get("DEEPSEEK_API_KEY") or ""
    model = os.environ.get("DEEPSEEK_MODEL") or "deepseek-chat"
    base_url = os.environ.get("DEEPSEEK_BASE_URL") or "https://api.deepseek.com/chat/completions"

    # Check local workspace settings.json first
    settings_paths = [
        Path.cwd() / "settings.json",
        HOME / ".akari" / "settings.json",
        HOME / ".akari" / "settings.json",
    ]

    for sp in settings_paths:
        if sp.exists():
            try:
                with open(sp, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if data.get("deepseekApiKey") and not api_key:
                        api_key = str(data["deepseekApiKey"]).strip()
                    if data.get("deepseekModel"):
                        model = str(data["deepseekModel"]).strip()
            except Exception:
                pass

    return {
        "api_key": api_key,
        "model": model,
        "base_url": base_url,
    }


def call_deepseek_chat(
    messages: List[Dict[str, str]],
    api_key: Optional[str] = None,
    model: Optional[str] = None,
    temperature: float = 0.3,
    json_mode: bool = False,
    timeout: int = 20,
) -> Optional[str]:
    """
    Perform a direct HTTP chat completion request to DeepSeek API.
    """
    cfg = get_deepseek_config()
    key = (api_key or cfg["api_key"]).strip()
    target_model = (model or cfg["model"]).strip() or "deepseek-chat"
    url = cfg["base_url"]

    if not key:
        return None

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {key}",
        "User-Agent": "Akari-AI-Client/2.0",
    }

    payload: Dict[str, Any] = {
        "model": target_model,
        "messages": messages,
        "temperature": temperature,
    }

    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    try:
        req_data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=req_data, headers=headers, method="POST")

        with urllib.request.urlopen(req, timeout=timeout) as response:
            res_body = response.read().decode("utf-8")
            data = json.loads(res_body)
            choices = data.get("choices") or []
            if choices:
                return choices[0].get("message", {}).get("content", "")
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8", errors="ignore")
        print(f"[DeepSeek Client HTTP {e.code}] {err_msg}")
    except Exception as e:
        print(f"[DeepSeek Client Error] {e}")

    return None


def generate_presentation_deck(
    topic: str,
    slide_count: int = 5,
    custom_instructions: Optional[str] = None,
    api_key: Optional[str] = None,
    model: Optional[str] = None,
) -> Optional[List[Dict[str, Any]]]:
    """
    Use DeepSeek to generate a multi-slide PowerPoint outline with title, bullet points, and notes.
    """
    prompt = f"""You are a world-class presentation designer and executive speechwriter.
Create a comprehensive, high-impact {slide_count}-slide PowerPoint presentation outline on:
"{topic}"

{f'Custom requirements: {custom_instructions}' if custom_instructions else ''}

Return ONLY a valid JSON object matching this schema:
{{
  "title": "Main Presentation Title",
  "subtitle": "Clear Subtitle or Goal",
  "slides": [
    {{
      "title": "Slide Title",
      "points": [
        "First sharp, data-informed or technical point",
        "Second high-impact insight",
        "Third actionable takeaway",
        "Fourth strategic conclusion"
      ],
      "notes": "Speaker notes"
    }}
  ]
}}
Strict JSON output only, no markdown codeblock wrapping."""

    messages = [
        {"role": "system", "content": "You are a professional PowerPoint designer and technical copywriter."},
        {"role": "user", "content": prompt},
    ]

    raw = call_deepseek_chat(messages, api_key=api_key, model=model, temperature=0.3, json_mode=False)
    if not raw:
        return None

    try:
        clean = re.sub(r"^```json\s*", "", raw.strip())
        clean = re.sub(r"\s*```$", "", clean.strip())
        parsed = json.loads(clean)
        if "slides" in parsed and isinstance(parsed["slides"], list):
            return parsed["slides"]
    except Exception as e:
        print(f"[DeepSeek PPT Parser Error] {e}")

    return None
