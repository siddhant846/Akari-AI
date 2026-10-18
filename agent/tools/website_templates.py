"""
Domain-Adaptive & Multi-Style Animated Website Engine for Akari AI.

Supports 9 domain categories across 6 distinct visual themes (including Light modes,
Warm Organic, Cyberpunk, Luxe Dark, Synthwave, and Minimalist Brutalist) and 3
structural layouts (Bento Grid, Split-Screen Hero, and Full-Width Marquee Showcase).
"""

from __future__ import annotations

import hashlib
import json
import time
from typing import Any, Dict, Tuple

THEME_PALETTES: Dict[str, Dict[str, str]] = {
    "nordic_light": {
        "name": "Nordic Clean Light",
        "is_dark": "false",
        "bg": "#f8fafc",
        "surface": "#ffffff",
        "surface_border": "rgba(0, 0, 0, 0.08)",
        "surface_hover": "rgba(0, 0, 0, 0.02)",
        "text": "#0f172a",
        "text_muted": "#64748b",
        "primary": "#2563eb",
        "primary_glow": "rgba(37, 99, 235, 0.2)",
        "secondary": "#0ea5e9",
        "accent": "#0284c7",
        "font_heading": "'Plus Jakarta Sans', sans-serif",
        "font_body": "'Inter', sans-serif",
        "card_shadow": "0 10px 30px rgba(0, 0, 0, 0.05)",
        "header_bg": "rgba(255, 255, 255, 0.88)",
        "badge_bg": "rgba(37, 99, 235, 0.08)",
        "badge_border": "rgba(37, 99, 235, 0.2)",
        "button_text": "#ffffff",
        "button_bg": "#2563eb",
    },
    "warm_organic": {
        "name": "Warm Earthy Artisan (Light)",
        "is_dark": "false",
        "bg": "#faf7f2",
        "surface": "#ffffff",
        "surface_border": "rgba(120, 113, 108, 0.15)",
        "surface_hover": "rgba(120, 113, 108, 0.04)",
        "text": "#292524",
        "text_muted": "#78716c",
        "primary": "#c2410c",
        "primary_glow": "rgba(194, 65, 12, 0.25)",
        "secondary": "#15803d",
        "accent": "#b45309",
        "font_heading": "'Playfair Display', serif",
        "font_body": "'Plus Jakarta Sans', sans-serif",
        "card_shadow": "0 12px 32px rgba(120, 113, 108, 0.08)",
        "header_bg": "rgba(250, 247, 242, 0.88)",
        "badge_bg": "rgba(194, 65, 12, 0.08)",
        "badge_border": "rgba(194, 65, 12, 0.25)",
        "button_text": "#ffffff",
        "button_bg": "#c2410c",
    },
    "cyberpunk_neon": {
        "name": "Cyberpunk Neon (Dark)",
        "is_dark": "true",
        "bg": "#07080d",
        "surface": "#10121a",
        "surface_border": "rgba(132, 204, 22, 0.35)",
        "surface_hover": "rgba(132, 204, 22, 0.08)",
        "text": "#f8fafc",
        "text_muted": "#94a3b8",
        "primary": "#84cc16",
        "primary_glow": "rgba(132, 204, 22, 0.4)",
        "secondary": "#06b6d4",
        "accent": "#f43f5e",
        "font_heading": "'Outfit', sans-serif",
        "font_body": "'Plus Jakarta Sans', sans-serif",
        "card_shadow": "0 12px 40px rgba(0, 0, 0, 0.8)",
        "header_bg": "rgba(7, 8, 13, 0.9)",
        "badge_bg": "rgba(132, 204, 22, 0.12)",
        "badge_border": "rgba(132, 204, 22, 0.4)",
        "button_text": "#000000",
        "button_bg": "linear-gradient(135deg, #84cc16, #06b6d4)",
    },
    "luxe_dark": {
        "name": "Obsidian & Brushed Gold (Luxury Dark)",
        "is_dark": "true",
        "bg": "#09090b",
        "surface": "#131317",
        "surface_border": "rgba(251, 191, 36, 0.25)",
        "surface_hover": "rgba(251, 191, 36, 0.05)",
        "text": "#fafafa",
        "text_muted": "#a1a1aa",
        "primary": "#fbbf24",
        "primary_glow": "rgba(251, 191, 36, 0.35)",
        "secondary": "#f59e0b",
        "accent": "#fb7185",
        "font_heading": "'Cinzel', serif",
        "font_body": "'Plus Jakarta Sans', sans-serif",
        "card_shadow": "0 14px 45px rgba(0, 0, 0, 0.75)",
        "header_bg": "rgba(9, 9, 11, 0.88)",
        "badge_bg": "rgba(251, 191, 36, 0.1)",
        "badge_border": "rgba(251, 191, 36, 0.3)",
        "button_text": "#050508",
        "button_bg": "linear-gradient(135deg, #fbbf24, #f59e0b)",
    },
    "retro_synthwave": {
        "name": "Sunset Synthwave & Violet (Vibrant Dark)",
        "is_dark": "true",
        "bg": "#0f081d",
        "surface": "#190f30",
        "surface_border": "rgba(249, 115, 22, 0.3)",
        "surface_hover": "rgba(249, 115, 22, 0.08)",
        "text": "#fdf4ff",
        "text_muted": "#d8b4fe",
        "primary": "#f97316",
        "primary_glow": "rgba(249, 115, 22, 0.4)",
        "secondary": "#a855f7",
        "accent": "#38bdf8",
        "font_heading": "'Outfit', sans-serif",
        "font_body": "'Plus Jakarta Sans', sans-serif",
        "card_shadow": "0 12px 36px rgba(168, 85, 247, 0.25)",
        "header_bg": "rgba(15, 8, 29, 0.88)",
        "badge_bg": "rgba(249, 115, 22, 0.12)",
        "badge_border": "rgba(249, 115, 22, 0.35)",
        "button_text": "#ffffff",
        "button_bg": "linear-gradient(135deg, #f97316, #a855f7)",
    },
    "minimal_brutalist": {
        "name": "Monochrome Editorial & Red (Light)",
        "is_dark": "false",
        "bg": "#f4f4f5",
        "surface": "#ffffff",
        "surface_border": "#000000",
        "surface_hover": "#fafafa",
        "text": "#09090b",
        "text_muted": "#52525b",
        "primary": "#000000",
        "primary_glow": "rgba(0, 0, 0, 0.15)",
        "secondary": "#dc2626",
        "accent": "#ea580c",
        "font_heading": "'Outfit', sans-serif",
        "font_body": "'Plus Jakarta Sans', sans-serif",
        "card_shadow": "5px 5px 0px #000000",
        "header_bg": "rgba(244, 244, 245, 0.95)",
        "badge_bg": "#000000",
        "badge_border": "#000000",
        "button_text": "#ffffff",
        "button_bg": "#000000",
    },
}


def detect_domain_type(category: str, name: str, description: str = "") -> str:
    """Classifies the target website into a specialized domain."""
    comb = f"{category} {name} {description}".lower()

    if any(k in comb for k in ["movie", "cinema", "film", "streaming", "recommendation", "series", "anime", "netflix", "watch", "actor"]):
        return "movie"
    if any(k in comb for k in ["gym", "fitness", "workout", "crossfit", "yoga", "trainer", "bodybuilding", "athletic", "pilates", "muscle"]):
        return "fitness"
    if any(k in comb for k in ["salon", "spa", "hair", "beauty", "barber", "nail", "massage", "wellness", "skincare", "cosmetic"]):
        return "salon"
    if any(k in comb for k in ["clinic", "doctor", "hospital", "dental", "dentist", "medical", "healthcare", "therapy", "physio"]):
        return "clinic"
    if any(k in comb for k in ["shop", "store", "brand", "clothing", "fashion", "apparel", "boutique", "jewelry", "ecommerce", "retail", "sneaker", "shoes"]):
        return "ecommerce"
    if any(k in comb for k in ["ai", "saas", "software", "tech", "app", "startup", "cloud", "api", "platform", "bot", "cyber"]):
        return "saas"
    if any(k in comb for k in ["portfolio", "photographer", "photography", "designer", "developer", "agency", "creative studio", "videographer"]):
        return "portfolio"
    if any(k in comb for k in ["restaurant", "food", "dining", "bistro", "bakery", "cafe", "coffee", "pizza", "burger", "sushi", "bar", "pub", "grill", "dhaba"]):
        return "restaurant"

    return "universal"


def pick_theme_and_layout(data: Dict[str, Any]) -> Tuple[Dict[str, str], str]:
    """Resolves or dynamically randomizes theme palette and structural layout."""
    user_theme = data.get("theme")
    user_layout = data.get("layout")

    name = data.get("name", "Site")
    category = data.get("category", "")

    # Domain specific hints if not specified by user
    domain = detect_domain_type(category, name, data.get("description", ""))

    themes_list = list(THEME_PALETTES.keys())
    layouts_list = ["bento", "split", "showcase"]

    h = int(hashlib.md5(f"{name}{category}{time.time()}".encode()).hexdigest(), 16)

    # Pick theme
    if user_theme and user_theme in THEME_PALETTES:
        chosen_theme_key = user_theme
    else:
        # Give distinct default matches per domain to prevent repetition
        if domain == "ecommerce":
            chosen_theme_key = ["nordic_light", "warm_organic", "minimal_brutalist"][h % 3]
        elif domain == "movie":
            chosen_theme_key = ["retro_synthwave", "cyberpunk_neon", "luxe_dark"][h % 3]
        elif domain == "fitness":
            chosen_theme_key = ["cyberpunk_neon", "minimal_brutalist", "retro_synthwave"][h % 3]
        elif domain == "salon":
            chosen_theme_key = ["warm_organic", "nordic_light", "luxe_dark"][h % 3]
        elif domain == "clinic":
            chosen_theme_key = ["nordic_light", "minimal_brutalist"][h % 2]
        elif domain == "saas":
            chosen_theme_key = ["cyberpunk_neon", "nordic_light", "retro_synthwave"][h % 3]
        else:
            chosen_theme_key = themes_list[h % len(themes_list)]

    # Pick layout
    if user_layout and user_layout in layouts_list:
        chosen_layout = user_layout
    else:
        chosen_layout = layouts_list[(h >> 2) % len(layouts_list)]

    return THEME_PALETTES[chosen_theme_key], chosen_layout


def _get_common_styles(theme: Dict[str, str]) -> str:
    return f"""
    :root {{
      --bg: {theme['bg']};
      --surface: {theme['surface']};
      --surface-border: {theme['surface_border']};
      --surface-hover: {theme['surface_hover']};
      --text: {theme['text']};
      --text-muted: {theme['text_muted']};
      --primary: {theme['primary']};
      --primary-glow: {theme['primary_glow']};
      --secondary: {theme['secondary']};
      --accent: {theme['accent']};
      --card-shadow: {theme['card_shadow']};
      --header-bg: {theme['header_bg']};
      --badge-bg: {theme['badge_bg']};
      --badge-border: {theme['badge_border']};
      --button-bg: {theme['button_bg']};
      --button-text: {theme['button_text']};
      --font-heading: {theme['font_heading']};
      --font-body: {theme['font_body']};
    }}
    * {{ margin: 0; padding: 0; box-sizing: border-box; scroll-behavior: smooth; }}
    body {{ background: var(--bg); color: var(--text); font-family: var(--font-body); line-height: 1.6; overflow-x: hidden; }}
    header {{
      position: fixed; top: 0; left: 0; width: 100%; padding: 18px 6%;
      display: flex; justify-content: space-between; align-items: center;
      background: var(--header-bg); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--surface-border); z-index: 100;
    }}
    .brand-title {{ font-family: var(--font-heading); font-size: 20px; font-weight: 800; color: var(--text); text-decoration: none; display: flex; align-items: center; gap: 10px; }}
    .brand-badge {{ width: 34px; height: 34px; border-radius: 8px; background: var(--button-bg); color: var(--button-text); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 15px; }}
    nav {{ display: flex; gap: 24px; align-items: center; }}
    nav a {{ color: var(--text-muted); text-decoration: none; font-size: 14px; font-weight: 600; transition: color 0.2s; }}
    nav a:hover {{ color: var(--primary); }}
    .header-btn {{
      background: var(--button-bg); color: var(--button-text); font-weight: 700; font-size: 13.5px;
      padding: 10px 22px; border-radius: 9999px; border: none; cursor: pointer; text-decoration: none;
      box-shadow: 0 4px 18px var(--primary-glow); transition: transform 0.2s, box-shadow 0.2s;
    }}
    .header-btn:hover {{ transform: translateY(-2px); }}
    footer {{ padding: 45px 6%; text-align: center; border-top: 1px solid var(--surface-border); color: var(--text-muted); font-size: 13px; }}
    .concept-tag {{ margin-top: 8px; font-weight: 600; color: var(--primary); font-size: 12px; }}
    @media (max-width: 768px) {{ nav {{ display: none; }} header {{ padding: 14px 5%; }} }}
    """


# ─────────────────────────────────────────────────────────────────────────────
# 1. MOVIE RECOMMENDATIONS & CINEMA WEB APP
# ─────────────────────────────────────────────────────────────────────────────
def build_movie_recommendations_html(data: Dict[str, Any], theme: Dict[str, str], layout: str) -> str:
    name = data.get("name", "CinePulse")
    category = data.get("category", "Movie Recommendations & Cinema")
    tagline = data.get("tagline") or "Discover Your Next Cinematic Obsession"
    description = data.get("description") or "Curated recommendations, hidden gems, and intelligent mood-matching."

    common_styles = _get_common_styles(theme)

    layout_css = ""
    layout_content = ""

    if layout == "bento":
        layout_css = """
        .bento-section { padding: 140px 6% 60px; max-width: 1280px; margin: 0 auto; }
        .bento-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
        .bento-card { background: var(--surface); border: 1px solid var(--surface-border); border-radius: 24px; padding: 32px; box-shadow: var(--card-shadow); transition: transform 0.25s, border-color 0.25s; }
        .bento-card:hover { transform: translateY(-4px); border-color: var(--primary); }
        .bento-span-2 { grid-column: span 2; }
        .bento-row-2 { grid-row: span 2; }
        @media (max-width: 900px) { .bento-grid { grid-template-columns: 1fr; } .bento-span-2, .bento-row-2 { grid-column: span 1; grid-row: span 1; } }
        """
        layout_content = f"""
        <section class="bento-section">
          <div style="margin-bottom: 36px; text-align: center;">
            <span style="background: var(--badge-bg); border: 1px solid var(--badge-border); color: var(--primary); padding: 6px 16px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px;">Bento Discovery Core</span>
            <h1 style="font-family: var(--font-heading); font-size: clamp(36px, 5vw, 64px); font-weight: 900; line-height: 1.1; margin-top: 14px;">{tagline}</h1>
            <p style="color: var(--text-muted); font-size: 17px; max-width: 600px; margin: 12px auto 0;">{description}</p>
          </div>

          <div class="bento-grid">
            <div class="bento-card bento-span-2">
              <span style="color: var(--primary); font-size: 12px; font-weight: 700; text-transform: uppercase;">✨ Spotlight Film of the Week</span>
              <h2 style="font-family: var(--font-heading); font-size: 32px; margin: 10px 0;">Chrono Paradox (2024)</h2>
              <p style="color: var(--text-muted); font-size: 15px; margin-bottom: 20px;">When deep-space telescope arrays intercept radio transmissions sent backwards 300 years from the future, astrophysicists race against quantum collapse.</p>
              <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                <button class="header-btn" onclick="openTrailer('Chrono Paradox')">▶ Watch 4K Trailer</button>
                <button style="background: var(--surface-hover); border: 1px solid var(--surface-border); color: var(--text); padding: 10px 20px; border-radius: 9999px; font-weight: 600; cursor: pointer;" onclick="toggleWatchlist('Chrono Paradox')">🔖 Add to Watchlist</button>
              </div>
            </div>

            <div class="bento-card bento-row-2">
              <h3 style="font-family: var(--font-heading); font-size: 20px; margin-bottom: 16px;">🎯 AI Mood Matcher</h3>
              <p style="color: var(--text-muted); font-size: 13.5px; margin-bottom: 18px;">Pick your headspace to get an instant match:</p>
              <div style="display: flex; flex-direction: column; gap: 10px;">
                <button class="mood-btn active" onclick="pickMood('Mind-Bending Sci-Fi', this)">🌌 Mind-Bending Sci-Fi</button>
                <button class="mood-btn" onclick="pickMood('Edge-Of-Seat Thriller', this)">⚡ Edge-Of-Seat Thriller</button>
                <button class="mood-btn" onclick="pickMood('Neon Cyberpunk Noir', this)">🌃 Neon Cyberpunk Noir</button>
                <button class="mood-btn" onclick="pickMood('Heartfelt Anime Classic', this)">🌸 Heartfelt Anime Classic</button>
              </div>
            </div>

            <div class="bento-card" style="display: flex; flex-direction: column; justify-content: center;">
              <span style="font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: var(--primary);">CRITIC CONSENSUS</span>
              <div style="font-family: var(--font-heading); font-size: 32px; font-weight: 900; color: var(--primary); margin-top: 6px;">8.9 ★</div>
              <div style="font-size: 13px; color: var(--text-muted);">Verified Curator Index</div>
            </div>

            <div class="bento-card" style="display: flex; flex-direction: column; justify-content: center;">
              <span style="font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: var(--secondary);">ARCHIVE VOLUME</span>
              <div style="font-family: var(--font-heading); font-size: 32px; font-weight: 900; color: var(--secondary); margin-top: 6px;">1,200+</div>
              <div style="font-size: 13px; color: var(--text-muted);">Curated Screenplay Deep-Dives</div>
            </div>
          </div>
        </section>
        """
    elif layout == "split":
        layout_css = """
        .split-hero { min-height: 85vh; padding: 140px 6% 60px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; align-items: center; max-width: 1280px; margin: 0 auto; }
        .feature-card { background: var(--surface); border: 1px solid var(--surface-border); border-radius: 24px; padding: 36px; box-shadow: var(--card-shadow); }
        @media (max-width: 860px) { .split-hero { grid-template-columns: 1fr; padding-top: 110px; } }
        """
        layout_content = f"""
        <section class="split-hero">
          <div>
            <span style="background: var(--badge-bg); border: 1px solid var(--badge-border); color: var(--primary); padding: 6px 16px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase;">Next-Gen Cinema Discovery</span>
            <h1 style="font-family: var(--font-heading); font-size: clamp(38px, 5.5vw, 68px); font-weight: 900; line-height: 1.12; margin: 18px 0;">{tagline}</h1>
            <p style="color: var(--text-muted); font-size: 18px; margin-bottom: 30px;">{description}</p>
            <div style="display: flex; gap: 14px; flex-wrap: wrap;">
              <button class="header-btn" onclick="openTrailer('Chrono Paradox')">▶ Stream Trailer</button>
              <a href="#catalog" class="header-btn" style="background: transparent; color: var(--text); border: 1px solid var(--surface-border); box-shadow: none;">Browse Catalog ↓</a>
            </div>
          </div>
          <div class="feature-card">
            <span style="color: var(--primary); font-size: 12px; font-weight: 800; text-transform: uppercase;">Top Rated Community Pick</span>
            <h2 style="font-family: var(--font-heading); font-size: 30px; margin: 10px 0;">Neon Horizon 2099</h2>
            <div style="color: var(--accent); font-weight: 700; font-size: 14px; margin-bottom: 12px;">9.1 ★ IMDb • Neo-Noir Cyberpunk</div>
            <p style="color: var(--text-muted); font-size: 14.5px; margin-bottom: 22px;">In a rain-drenched megacity where human memories are traded on decentralized markets, an unlicensed memory detective discovers an encrypted truth.</p>
            <button class="header-btn" style="width: 100%; text-align: center;" onclick="toggleWatchlist('Neon Horizon 2099')">🔖 Save to Watchlist</button>
          </div>
        </section>
        """
    else:  # showcase
        layout_css = """
        .showcase-hero { padding: 150px 6% 40px; text-align: center; max-width: 900px; margin: 0 auto; }
        .ticker-wrap { width: 100%; overflow: hidden; background: var(--surface); border-top: 1px solid var(--surface-border); border-bottom: 1px solid var(--surface-border); padding: 14px 0; white-space: nowrap; margin-bottom: 50px; }
        .ticker-track { display: inline-block; animation: ticker 25s linear infinite; }
        .ticker-item { display: inline-block; padding: 0 24px; font-weight: 700; font-size: 14px; color: var(--primary); text-transform: uppercase; letter-spacing: 1.5px; }
        @keyframes ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        """
        layout_content = f"""
        <section class="showcase-hero">
          <span style="background: var(--badge-bg); border: 1px solid var(--badge-border); color: var(--primary); padding: 6px 16px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase;">Curated Cinema Stream</span>
          <h1 style="font-family: var(--font-heading); font-size: clamp(38px, 6vw, 72px); font-weight: 900; line-height: 1.1; margin: 18px 0;">{tagline}</h1>
          <p style="color: var(--text-muted); font-size: 18px; max-width: 650px; margin: 0 auto 30px;">{description}</p>
        </section>
        <div class="ticker-wrap">
          <div class="ticker-track">
            <span class="ticker-item">🌌 CHRONO PARADOX (9.0)</span>
            <span class="ticker-item">⚡ NEON HORIZON 2099 (9.1)</span>
            <span class="ticker-item">🌊 THE SILENT ECHO (8.8)</span>
            <span class="ticker-item">🌸 MIDNIGHT IN KYOTO (8.9)</span>
            <span class="ticker-item">🌌 CHRONO PARADOX (9.0)</span>
            <span class="ticker-item">⚡ NEON HORIZON 2099 (9.1)</span>
          </div>
        </div>
        """

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{name}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Cinzel:wght@600;800&family=Playfair+Display:ital,wght@0,600;1,400&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    {common_styles}
    {layout_css}
    .mood-btn {{
      background: var(--surface-hover); border: 1px solid var(--surface-border); color: var(--text);
      padding: 10px 16px; border-radius: 12px; font-size: 13.5px; font-weight: 600; cursor: pointer; text-align: left; transition: all 0.2s;
    }}
    .mood-btn:hover, .mood-btn.active {{ background: var(--button-bg); color: var(--button-text); border-color: transparent; }}
    .films-grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 24px; padding: 40px 6% 80px; max-width: 1280px; margin: 0 auto; }}
    .film-card {{ background: var(--surface); border: 1px solid var(--surface-border); border-radius: 20px; padding: 24px; box-shadow: var(--card-shadow); display: flex; flex-direction: column; justify-content: space-between; }}
  </style>
</head>
<body>
  <header>
    <a href="#" class="brand-title"><div class="brand-badge">🎬</div><span>{name}</span></a>
    <nav>
      <a href="#discover">Discover</a>
      <a href="#genres">Genres</a>
      <a href="#curators">Curators</a>
    </nav>
    <button class="header-btn" onclick="alert('Watchlist contains 3 films saved!')">🔖 Watchlist (3)</button>
  </header>

  <main id="discover">
    {layout_content}

    <div class="films-grid">
      <div class="film-card">
        <img src="https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=700&q=80" alt="Chrono Paradox" style="width: 100%; height: 180px; object-fit: cover; border-radius: 14px; margin-bottom: 16px;">
        <div>
          <span style="font-size: 12px; font-weight: 700; color: var(--primary);">2024 • Sci-Fi / Thriller</span>
          <h3 style="font-family: var(--font-heading); font-size: 20px; margin: 6px 0;">Chrono Paradox</h3>
          <p style="color: var(--text-muted); font-size: 13.5px; margin-bottom: 16px;">Tense quantum physics exploration into reverse-temporal communication.</p>
        </div>
        <button class="header-btn" style="width: 100%; text-align: center;" onclick="openTrailer('Chrono Paradox')">▶ Watch Trailer</button>
      </div>

      <div class="film-card">
        <img src="https://images.unsplash.com/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&w=700&q=80" alt="Neon Horizon 2099" style="width: 100%; height: 180px; object-fit: cover; border-radius: 14px; margin-bottom: 16px;">
        <div>
          <span style="font-size: 12px; font-weight: 700; color: var(--secondary);">2023 • Cyberpunk Noir</span>
          <h3 style="font-family: var(--font-heading); font-size: 20px; margin: 6px 0;">Neon Horizon 2099</h3>
          <p style="color: var(--text-muted); font-size: 13.5px; margin-bottom: 16px;">Memory detectives navigate neon-lit subterranean conspiracies.</p>
        </div>
        <button class="header-btn" style="width: 100%; text-align: center;" onclick="openTrailer('Neon Horizon 2099')">▶ Watch Trailer</button>
      </div>

      <div class="film-card">
        <img src="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=700&q=80" alt="The Silent Echo" style="width: 100%; height: 180px; object-fit: cover; border-radius: 14px; margin-bottom: 16px;">
        <div>
          <span style="font-size: 12px; font-weight: 700; color: var(--accent);">2024 • Psychological Drama</span>
          <h3 style="font-family: var(--font-heading); font-size: 20px; margin: 6px 0;">The Silent Echo</h3>
          <p style="color: var(--text-muted); font-size: 13.5px; margin-bottom: 16px;">A North Atlantic lighthouse keeper hears transmissions of his deepest thoughts.</p>
        </div>
        <button class="header-btn" style="width: 100%; text-align: center;" onclick="openTrailer('The Silent Echo')">▶ Watch Trailer</button>
      </div>
    </div>
  </main>

  <footer>
    <p>&copy; {name}. Theme: {theme['name']} • Layout: {layout.title()}.</p>
    <p class="concept-tag">Concept preview, not approved by the business.</p>
  </footer>

  <script>
    function openTrailer(film) {{ alert('Streaming 4K Trailer for ' + film + ' in theater mode!'); }}
    function toggleWatchlist(film) {{ alert(film + ' added to your saved watchlist!'); }}
    function pickMood(m, btn) {{
      document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      alert('Matched with curated recommendations for: ' + m);
    }}
  </script>
</body>
</html>"""


# ─────────────────────────────────────────────────────────────────────────────
# 2. E-COMMERCE / BRAND & RETAIL
# ─────────────────────────────────────────────────────────────────────────────
def build_ecommerce_shop_html(data: Dict[str, Any], theme: Dict[str, str], layout: str) -> str:
    name = data.get("name", "Aura Apparel")
    category = data.get("category", "Fashion & Lifestyle Brand")
    tagline = data.get("tagline") or "Redefining Contemporary Aesthetics"
    city = data.get("city", "New York")

    common_styles = _get_common_styles(theme)

    layout_css = ""
    layout_content = ""

    if layout == "bento":
        layout_css = """
        .bento-section { padding: 130px 6% 40px; max-width: 1280px; margin: 0 auto; }
        .bento-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
        .bento-card { background: var(--surface); border: 1px solid var(--surface-border); border-radius: 24px; padding: 32px; box-shadow: var(--card-shadow); }
        .span-2 { grid-column: span 2; }
        @media (max-width: 900px) { .bento-grid { grid-template-columns: 1fr; } .span-2 { grid-column: span 1; } }
        """
        layout_content = f"""
        <section class="bento-section">
          <div style="text-align: center; margin-bottom: 40px;">
            <span style="background: var(--badge-bg); border: 1px solid var(--badge-border); color: var(--primary); padding: 6px 16px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase;">New Season Drops</span>
            <h1 style="font-family: var(--font-heading); font-size: clamp(36px, 5vw, 68px); font-weight: 900; margin-top: 14px;">{tagline}</h1>
          </div>
          <div class="bento-grid">
            <div class="bento-card span-2" style="display: flex; flex-direction: column; justify-content: space-between;">
              <div>
                <span style="color: var(--primary); font-size: 12px; font-weight: 800; text-transform: uppercase;">Flagship Outerwear</span>
                <h2 style="font-family: var(--font-heading); font-size: 32px; margin: 10px 0;">Bonded Merino Overcoat</h2>
                <p style="color: var(--text-muted); font-size: 16px; max-width: 500px; margin-bottom: 24px;">Precision-tailored from zero-waste Italian wool, engineered with waterproof seam sealing.</p>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 26px; font-weight: 800; font-family: var(--font-heading);">$340.00</span>
                <button class="header-btn" onclick="addToBag('Bonded Merino Overcoat')">Add to Bag</button>
              </div>
            </div>
            <div class="bento-card" style="text-align: center; display: flex; flex-direction: column; justify-content: center;">
              <span style="font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: var(--primary);">ZERO-WASTE STANDARDS</span>
              <h3 style="font-family: var(--font-heading); font-size: 20px; margin: 12px 0;">Sustainable Craft</h3>
              <p style="color: var(--text-muted); font-size: 13.5px;">100% circular certified materials, non-toxic botanical dyes, and climate-neutral European mills.</p>
            </div>
          </div>
        </section>
        """
    else:  # split or showcase
        layout_css = """
        .split-hero { padding: 140px 6% 60px; min-height: 80vh; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; align-items: center; max-width: 1280px; margin: 0 auto; }
        .hero-img-box { background: var(--surface); border: 1px solid var(--surface-border); border-radius: 24px; padding: 24px; box-shadow: var(--card-shadow); text-align: center; }
        @media (max-width: 860px) { .split-hero { grid-template-columns: 1fr; } }
        """
        layout_content = f"""
        <section class="split-hero">
          <div>
            <span style="background: var(--badge-bg); border: 1px solid var(--badge-border); color: var(--primary); padding: 6px 16px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase;">Capsule Collection • {city}</span>
            <h1 style="font-family: var(--font-heading); font-size: clamp(38px, 5vw, 68px); font-weight: 900; line-height: 1.15; margin: 18px 0;">{tagline}</h1>
            <p style="color: var(--text-muted); font-size: 18px; margin-bottom: 28px;">Architectural silhouettes and understated luxury crafted for modern everyday movement.</p>
            <button class="header-btn" onclick="addToBag('Seasonal Essentials Pack')">Explore Collection →</button>
          </div>
          <div class="hero-img-box">
            <img src="https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80" alt="Monochrome Drop" style="width: 100%; height: 260px; object-fit: cover; border-radius: 16px; margin-bottom: 16px;">
            <h2 style="font-family: var(--font-heading); font-size: 24px; margin: 10px 0;">Monochrome Minimalist Drop</h2>
            <p style="color: var(--primary); font-size: 20px; font-weight: 800; margin-bottom: 18px;">$180.00 — $360.00</p>
            <button class="header-btn" style="width: 100%; text-align: center;" onclick="addToBag('Monochrome Minimalist Drop')">Add All to Bag</button>
          </div>
        </section>
        """

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{name}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Cinzel:wght@600;800&family=Playfair+Display:ital,wght@0,600;1,400&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    {common_styles}
    {layout_css}
    .products-grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 24px; padding: 40px 6% 80px; max-width: 1280px; margin: 0 auto; }}
    .product-card {{ background: var(--surface); border: 1px solid var(--surface-border); border-radius: 20px; padding: 20px; box-shadow: var(--card-shadow); display: flex; flex-direction: column; justify-content: space-between; }}
  </style>
</head>
<body>
  <header>
    <a href="#" class="brand-title"><div class="brand-badge">✦</div><span>{name}</span></a>
    <nav>
      <a href="#shop">Shop</a>
      <a href="#about">Philosophy</a>
      <a href="#archive">Archive</a>
    </nav>
    <button class="header-btn" onclick="openBag()">Bag (<span id="bagCount">0</span>)</button>
  </header>

  <main>
    {layout_content}

    <div class="products-grid" id="shop">
      <div class="product-card">
        <img src="https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80" alt="Kinetic Tech Runner" style="width: 100%; height: 200px; object-fit: cover; border-radius: 14px; margin-bottom: 14px;">
        <h3 style="font-family: var(--font-heading); font-size: 19px; margin-bottom: 4px;">Kinetic Tech Runner</h3>
        <p style="color: var(--primary); font-weight: 800; font-size: 17px; margin-bottom: 14px;">$210.00</p>
        <button class="header-btn" style="width: 100%; text-align: center;" onclick="addToBag('Kinetic Tech Runner')">Add to Bag</button>
      </div>

      <div class="product-card">
        <img src="https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=600&q=80" alt="Titanium Geometric Shades" style="width: 100%; height: 200px; object-fit: cover; border-radius: 14px; margin-bottom: 14px;">
        <h3 style="font-family: var(--font-heading); font-size: 19px; margin-bottom: 4px;">Titanium Geometric Shades</h3>
        <p style="color: var(--primary); font-weight: 800; font-size: 17px; margin-bottom: 14px;">$165.00</p>
        <button class="header-btn" style="width: 100%; text-align: center;" onclick="addToBag('Titanium Geometric Shades')">Add to Bag</button>
      </div>

      <div class="product-card">
        <img src="https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=600&q=80" alt="Cordura Modular Pack" style="width: 100%; height: 200px; object-fit: cover; border-radius: 14px; margin-bottom: 14px;">
        <h3 style="font-family: var(--font-heading); font-size: 19px; margin-bottom: 4px;">Cordura Modular Pack</h3>
        <p style="color: var(--primary); font-weight: 800; font-size: 17px; margin-bottom: 14px;">$145.00</p>
        <button class="header-btn" style="width: 100%; text-align: center;" onclick="addToBag('Cordura Modular Pack')">Add to Bag</button>
      </div>
    </div>
  </main>

  <footer>
    <p>&copy; {name}. Theme: {theme['name']} • Layout: {layout.title()}.</p>
    <p class="concept-tag">Concept preview, not approved by the business.</p>
  </footer>

  <script>
    let bag = 0;
    function addToBag(item) {{
      bag++;
      document.getElementById('bagCount').innerText = bag;
      alert(item + ' added to your shopping bag!');
    }}
    function openBag() {{ alert('Shopping bag has ' + bag + ' items. Ready for checkout!'); }}
  </script>
</body>
</html>"""


# ─────────────────────────────────────────────────────────────────────────────
# 3. FITNESS & GYM
# ─────────────────────────────────────────────────────────────────────────────
def build_fitness_gym_html(data: Dict[str, Any], theme: Dict[str, str], layout: str) -> str:
    name = data.get("name", "Apex Athletic Club")
    category = data.get("category", "Strength, Conditioning & Combat Club")
    tagline = data.get("tagline") or "Forge Unstoppable Strength & Endurance"
    city = data.get("city", "Downtown")
    phone = data.get("phone", "+1 (555) 890-4422")

    common_styles = _get_common_styles(theme)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{name}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;700;800;900&family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Cinzel:wght@700&display=swap" rel="stylesheet">
  <style>
    {common_styles}
    .hero {{ padding: 140px 6% 60px; text-align: center; max-width: 900px; margin: 0 auto; }}
    .stats-row {{ display: flex; gap: 20px; justify-content: center; margin: 40px 0; flex-wrap: wrap; }}
    .stat-pill {{ background: var(--surface); border: 1px solid var(--surface-border); border-radius: 18px; padding: 20px 30px; text-align: center; box-shadow: var(--card-shadow); }}
    .tier-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; padding: 40px 6% 80px; max-width: 1100px; margin: 0 auto; }}
    .tier-card {{ background: var(--surface); border: 1px solid var(--surface-border); border-radius: 20px; padding: 32px; box-shadow: var(--card-shadow); display: flex; flex-direction: column; justify-content: space-between; }}
  </style>
</head>
<body>
  <header>
    <a href="#" class="brand-title"><div class="brand-badge">⚡</div><span>{name}</span></a>
    <nav>
      <a href="#plans">Memberships</a>
      <a href="#programs">Programs</a>
      <a href="#facility">Facility</a>
    </nav>
    <button class="header-btn" onclick="claimPass()">Free 7-Day Pass</button>
  </header>

  <main>
    <section class="hero">
      <span style="background: var(--badge-bg); border: 1px solid var(--badge-border); color: var(--primary); padding: 6px 16px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase;">{category} • {city}</span>
      <h1 style="font-family: var(--font-heading); font-size: clamp(38px, 6vw, 72px); font-weight: 900; line-height: 1.1; margin: 18px 0;">{tagline}</h1>
      <p style="color: var(--text-muted); font-size: 18px; max-width: 600px; margin: 0 auto 30px;">Olympic lifting bays, sprint tracks, cryo-recovery suites, and elite coaching.</p>
      <div class="stats-row">
        <div class="stat-pill"><div style="font-family: var(--font-heading); font-size: 30px; font-weight: 900; color: var(--primary);">24 / 7</div><div style="font-size: 12px; color: var(--text-muted); text-transform: uppercase;">Facility Access</div></div>
        <div class="stat-pill"><div style="font-family: var(--font-heading); font-size: 30px; font-weight: 900; color: var(--secondary);">45+</div><div style="font-size: 12px; color: var(--text-muted); text-transform: uppercase;">Certified Coaches</div></div>
        <div class="stat-pill"><div style="font-family: var(--font-heading); font-size: 30px; font-weight: 900; color: var(--accent);">10,000+</div><div style="font-size: 12px; color: var(--text-muted); text-transform: uppercase;">Athletes Trained</div></div>
      </div>
    </section>

    <div style="max-width: 1100px; margin: 0 auto 40px; padding: 0 6%;">
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px;" id="programs">
        <div style="background: var(--surface); border: 1px solid var(--surface-border); border-radius: 20px; overflow: hidden; box-shadow: var(--card-shadow);">
          <img src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=700&q=80" alt="Strength & Conditioning" style="width: 100%; height: 200px; object-fit: cover;">
          <div style="padding: 24px;">
            <span style="font-size: 11px; font-weight: 800; color: var(--primary); text-transform: uppercase; letter-spacing: 1px;">ELITE COACHING</span>
            <h3 style="font-family: var(--font-heading); font-size: 20px; margin: 8px 0;">Olympic Power & Hybrid Lifts</h3>
            <p style="color: var(--text-muted); font-size: 14px;">Specialized Eleiko bar platforms, velocity-based training trackers, and competitive programming.</p>
          </div>
        </div>
        <div style="background: var(--surface); border: 1px solid var(--surface-border); border-radius: 20px; overflow: hidden; box-shadow: var(--card-shadow);">
          <img src="https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?auto=format&fit=crop&w=700&q=80" alt="Combat & Boxing" style="width: 100%; height: 200px; object-fit: cover;">
          <div style="padding: 24px;">
            <span style="font-size: 11px; font-weight: 800; color: var(--secondary); text-transform: uppercase; letter-spacing: 1px;">HIGH INTENSITY</span>
            <h3 style="font-family: var(--font-heading); font-size: 20px; margin: 8px 0;">Combat Boxing & Muay Thai</h3>
            <p style="color: var(--text-muted); font-size: 14px;">Championship heavy bags, tactical footwork rings, and cardio conditioning rounds.</p>
          </div>
        </div>
      </div>
    </div>

    <div class="tier-grid" id="plans">
      <div class="tier-card">
        <div>
          <h3 style="font-family: var(--font-heading); font-size: 22px;">Standard Athlete</h3>
          <div style="font-family: var(--font-heading); font-size: 36px; font-weight: 900; color: var(--primary); margin: 12px 0;">$49 <span style="font-size: 14px; font-weight: 400; color: var(--text-muted);">/ mo</span></div>
          <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 20px;">Full access to training floors, recovery saunas, and member mobile app.</p>
        </div>
        <button class="header-btn" style="width: 100%; text-align: center;" onclick="claimPass()">Select Membership</button>
      </div>

      <div class="tier-card" style="border-color: var(--primary);">
        <div>
          <span style="color: var(--primary); font-size: 12px; font-weight: 800; text-transform: uppercase;">Most Popular</span>
          <h3 style="font-family: var(--font-heading); font-size: 22px;">All-Access VIP</h3>
          <div style="font-family: var(--font-heading); font-size: 36px; font-weight: 900; color: var(--primary); margin: 12px 0;">$89 <span style="font-size: 14px; font-weight: 400; color: var(--text-muted);">/ mo</span></div>
          <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 20px;">24/7 unlimited access, all combat & HIIT classes, private sauna & ice bath suites.</p>
        </div>
        <button class="header-btn" style="width: 100%; text-align: center;" onclick="claimPass()">Select Membership</button>
      </div>
    </div>
  </main>

  <footer>
    <p>&copy; {name}. Direct hotline: {phone} • Theme: {theme['name']} • Layout: {layout.title()}.</p>
    <p class="concept-tag">Concept preview, not approved by the business.</p>
  </footer>

  <script>
    function claimPass() {{ alert('7-Day Free Pass pass activated for ' + '{name}' + '!'); }}
  </script>
</body>
</html>"""


# ─────────────────────────────────────────────────────────────────────────────
# 4. SALON & SPA
# ─────────────────────────────────────────────────────────────────────────────
def build_salon_spa_html(data: Dict[str, Any], theme: Dict[str, str], layout: str) -> str:
    name = data.get("name", "Luxe Hair & Esthetics")
    city = data.get("city", "Downtown")
    phone = data.get("phone", "+1 (555) 762-3390")

    common_styles = _get_common_styles(theme)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{name}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,600;1,400&family=Cinzel:wght@600;800&display=swap" rel="stylesheet">
  <style>
    {common_styles}
    .hero {{ padding: 140px 6% 60px; text-align: center; max-width: 850px; margin: 0 auto; }}
    .treatments {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; padding: 40px 6% 80px; max-width: 1100px; margin: 0 auto; }}
    .treatment-card {{ background: var(--surface); border: 1px solid var(--surface-border); border-radius: 18px; padding: 26px; box-shadow: var(--card-shadow); display: flex; justify-content: space-between; align-items: center; }}
  </style>
</head>
<body>
  <header>
    <a href="#" class="brand-title"><div class="brand-badge">🌸</div><span>{name}</span></a>
    <nav>
      <a href="#services">Services</a>
      <a href="#stylists">Stylists</a>
      <a href="#story">Story</a>
    </nav>
    <button class="header-btn" onclick="bookAppt()">Book Appointment</button>
  </header>

  <main>
    <section class="hero">
      <span style="background: var(--badge-bg); border: 1px solid var(--badge-border); color: var(--primary); padding: 6px 16px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase;">Luxury Wellness Studio • {city}</span>
      <h1 style="font-family: var(--font-heading); font-size: clamp(38px, 6vw, 68px); font-weight: 700; line-height: 1.15; margin: 18px 0;">Where Radiance Meets <span>Pure Serenity</span></h1>
      <p style="color: var(--text-muted); font-size: 18px; margin-bottom: 28px;">Master hair colorists, bespoke aesthetic rituals, and restorative scalp therapies.</p>
      <button class="header-btn" onclick="bookAppt()">Reserve Your Visit</button>
    </section>

    <div class="treatments" id="services">
      <div class="treatment-card"><div><h3 style="font-family: var(--font-heading); font-size: 18px;">Couture Balayage & Gloss</h3><p style="color: var(--text-muted); font-size: 13px;">Bespoke hand-painted dimensional highlights.</p></div><span style="font-weight: 800; font-size: 18px; color: var(--primary);">$180+</span></div>
      <div class="treatment-card"><div><h3 style="font-family: var(--font-heading); font-size: 18px;">Cellular Radiance Facial</h3><p style="color: var(--text-muted); font-size: 13px;">Deep peptide infusion and micro-current contour.</p></div><span style="font-weight: 800; font-size: 18px; color: var(--primary);">$145</span></div>
      <div class="treatment-card"><div><h3 style="font-family: var(--font-heading); font-size: 18px;">Silk Press & Herbal Scalp Spa</h3><p style="color: var(--text-muted); font-size: 13px;">Organic aromatherapy massage & blowout.</p></div><span style="font-weight: 800; font-size: 18px; color: var(--primary);">$85</span></div>
    </div>
  </main>

  <footer>
    <p>&copy; {name}. Appointments: {phone} • Theme: {theme['name']} • Layout: {layout.title()}.</p>
    <p class="concept-tag">Concept preview, not approved by the business.</p>
  </footer>

  <script>
    function bookAppt() {{ alert('Appointment scheduler opened for ' + '{name}' + '!'); }}
  </script>
</body>
</html>"""


# ─────────────────────────────────────────────────────────────────────────────
# 5. HEALTHCARE & CLINIC
# ─────────────────────────────────────────────────────────────────────────────
def build_clinic_medical_html(data: Dict[str, Any], theme: Dict[str, str], layout: str) -> str:
    name = data.get("name", "CarePoint Clinic")
    city = data.get("city", "Central City")
    phone = data.get("phone", "+1 (555) 430-8811")

    common_styles = _get_common_styles(theme)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{name}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    {common_styles}
    .hero {{ padding: 140px 6% 60px; text-align: center; max-width: 850px; margin: 0 auto; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; padding: 40px 6% 80px; max-width: 1100px; margin: 0 auto; }}
    .card {{ background: var(--surface); border: 1px solid var(--surface-border); border-radius: 20px; padding: 28px; box-shadow: var(--card-shadow); }}
  </style>
</head>
<body>
  <header>
    <a href="#" class="brand-title"><div class="brand-badge">🩺</div><span>{name}</span></a>
    <nav>
      <a href="#care">Specialties</a>
      <a href="#doctors">Physicians</a>
      <a href="#contact">Contact</a>
    </nav>
    <button class="header-btn" onclick="bookConsult()">Book Consultation</button>
  </header>

  <main>
    <section class="hero">
      <span style="background: var(--badge-bg); border: 1px solid var(--badge-border); color: var(--primary); padding: 6px 16px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase;">Medical Excellence • {city}</span>
      <h1 style="font-family: var(--font-heading); font-size: clamp(38px, 6vw, 68px); font-weight: 800; line-height: 1.15; margin: 18px 0;">World-Class Healthcare For <span>Your Family</span></h1>
      <p style="color: var(--text-muted); font-size: 18px; margin-bottom: 28px;">Board-certified specialists, state-of-the-art diagnostic imaging, and compassionate outpatient care.</p>
      <button class="header-btn" onclick="bookConsult()">Schedule Visit</button>
    </section>

    <div class="grid" id="care">
      <div class="card"><h3 style="font-family: var(--font-heading); font-size: 20px; margin-bottom: 8px;">Family Medicine</h3><p style="color: var(--text-muted); font-size: 14px;">Preventive health assessments, routine screenings, and holistic wellness.</p></div>
      <div class="card"><h3 style="font-family: var(--font-heading); font-size: 20px; margin-bottom: 8px;">Cardiology & Diagnostics</h3><p style="color: var(--text-muted); font-size: 14px;">Advanced echocardiograms, stress testing, and vascular health plans.</p></div>
      <div class="card"><h3 style="font-family: var(--font-heading); font-size: 20px; margin-bottom: 8px;">Pediatrics & Dental</h3><p style="color: var(--text-muted); font-size: 14px;">Gentle childhood immunizations and comprehensive preventative dental care.</p></div>
    </div>
  </main>

  <footer>
    <p>&copy; {name}. Emergency Desk: {phone} • Theme: {theme['name']} • Layout: {layout.title()}.</p>
    <p class="concept-tag">Concept preview, not approved by the business.</p>
  </footer>

  <script>
    function bookConsult() {{ alert('Consultation portal opened for ' + '{name}' + '!'); }}
  </script>
</body>
</html>"""


# ─────────────────────────────────────────────────────────────────────────────
# 6. TECH STARTUP & AI SAAS
# ─────────────────────────────────────────────────────────────────────────────
def build_tech_saas_html(data: Dict[str, Any], theme: Dict[str, str], layout: str) -> str:
    name = data.get("name", "NeuralFlow AI")
    tagline = data.get("tagline") or "Autonomous Edge Intelligence at Scale"

    common_styles = _get_common_styles(theme)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{name}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;700;800;900&family=JetBrains+Mono:wght@400;600&family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    {common_styles}
    .hero {{ padding: 140px 6% 60px; text-align: center; max-width: 900px; margin: 0 auto; }}
    .terminal {{ background: #000; border: 1px solid var(--surface-border); border-radius: 14px; padding: 22px; width: 100%; max-width: 650px; font-family: 'JetBrains Mono', monospace; font-size: 13.5px; text-align: left; margin: 32px auto; color: var(--primary); box-shadow: var(--card-shadow); }}
    .features {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; padding: 40px 6% 80px; max-width: 1200px; margin: 0 auto; }}
    .f-card {{ background: var(--surface); border: 1px solid var(--surface-border); border-radius: 20px; padding: 28px; box-shadow: var(--card-shadow); }}
  </style>
</head>
<body>
  <header>
    <a href="#" class="brand-title"><div class="brand-badge">⚡</div><span>{name}</span></a>
    <nav>
      <a href="#features">Features</a>
      <a href="#docs">API Docs</a>
      <a href="#pricing">Pricing</a>
    </nav>
    <button class="header-btn" onclick="startTrial()">Deploy in 60s →</button>
  </header>

  <main>
    <section class="hero">
      <span style="background: var(--badge-bg); border: 1px solid var(--badge-border); color: var(--primary); padding: 6px 16px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase;">Autonomous Model Infrastructure</span>
      <h1 style="font-family: var(--font-heading); font-size: clamp(38px, 6vw, 76px); font-weight: 900; line-height: 1.1; margin: 18px 0;">{tagline}</h1>
      <p style="color: var(--text-muted); font-size: 18px; max-width: 650px; margin: 0 auto;">Run ultra-low-latency neural inference and agent swarms globally with sub-millisecond edge routing.</p>
      <div class="terminal">
        <span style="color: #64748b;">$</span> curl -sL https://install.{name.lower().split()[0]}.io | sh<br>
        <span style="color: #10b981;">✔ Initialized 420+ Global Edge Clusters</span><br>
        <span style="color: var(--primary);">✨ P99 Latency: 12.4ms across 6 continents</span>
      </div>
      <button class="header-btn" onclick="startTrial()">Get Started Free</button>
    </section>

    <div class="features" id="features">
      <div class="f-card"><h3 style="font-family: var(--font-heading); font-size: 20px; margin-bottom: 8px;">Zero Cold Starts</h3><p style="color: var(--text-muted); font-size: 14px;">Instant worker waking powered by WebAssembly lightweight sandboxes.</p></div>
      <div class="f-card"><h3 style="font-family: var(--font-heading); font-size: 20px; margin-bottom: 8px;">Military Encryption</h3><p style="color: var(--text-muted); font-size: 14px;">Hardware enclave verification and end-to-end cryptographic proofs.</p></div>
      <div class="f-card"><h3 style="font-family: var(--font-heading); font-size: 20px; margin-bottom: 8px;">Global Anycast Edge</h3><p style="color: var(--text-muted); font-size: 14px;">Automatic multi-region replication and resilient failovers.</p></div>
    </div>
  </main>

  <footer>
    <p>&copy; {name}. Theme: {theme['name']} • Layout: {layout.title()}.</p>
    <p class="concept-tag">Concept preview, not approved by the business.</p>
  </footer>

  <script>
    function startTrial() {{ alert('Sandbox API key issued for ' + '{name}' + '!'); }}
  </script>
</body>
</html>"""


# ─────────────────────────────────────────────────────────────────────────────
# 7. CREATIVE PORTFOLIO & AGENCY
# ─────────────────────────────────────────────────────────────────────────────
def build_portfolio_agency_html(data: Dict[str, Any], theme: Dict[str, str], layout: str) -> str:
    name = data.get("name", "Studio Nova")
    tagline = data.get("tagline") or "Crafting Distinctive Brands & Digital Experiences"

    common_styles = _get_common_styles(theme)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{name}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Playfair+Display:ital,wght@0,600;1,400&family=Outfit:wght@800;900&display=swap" rel="stylesheet">
  <style>
    {common_styles}
    .hero {{ padding: 140px 6% 60px; max-width: 1050px; margin: 0 auto; }}
    .works {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 30px; padding: 40px 6% 80px; max-width: 1200px; margin: 0 auto; }}
    .work-card {{ background: var(--surface); border: 1px solid var(--surface-border); border-radius: 20px; overflow: hidden; box-shadow: var(--card-shadow); }}
    .work-cover {{ height: 220px; background: var(--surface-hover); display: flex; align-items: center; justify-content: center; font-size: 40px; }}
    .work-body {{ padding: 24px; }}
  </style>
</head>
<body>
  <header>
    <a href="#" class="brand-title"><div class="brand-badge">✦</div><span>{name}</span></a>
    <nav>
      <a href="#work">Work</a>
      <a href="#about">Studio</a>
      <a href="#contact">Contact</a>
    </nav>
    <button class="header-btn" onclick="inquire()">Start Project</button>
  </header>

  <main>
    <section class="hero">
      <span style="background: var(--badge-bg); border: 1px solid var(--badge-border); color: var(--primary); padding: 6px 16px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase;">Independent Creative Direction</span>
      <h1 style="font-family: var(--font-heading); font-size: clamp(38px, 6vw, 72px); font-weight: 800; line-height: 1.1; margin: 18px 0;">{tagline}</h1>
      <p style="color: var(--text-muted); font-size: 18px; max-width: 600px;">We collaborate with forward-thinking brands to develop iconic identities, spatial audio designs, and digital flagships.</p>
    </section>

    <div class="works" id="work">
      <div class="work-card"><div class="work-cover">🌐</div><div class="work-body"><h3 style="font-family: var(--font-heading); font-size: 20px; margin-bottom: 6px;">Spatial Audio Monograph</h3><p style="color: var(--text-muted); font-size: 14px;">Interactive virtual soundstage identity for Nordic acoustic lab.</p></div></div>
      <div class="work-card"><div class="work-cover">✨</div><div class="work-body"><h3 style="font-family: var(--font-heading); font-size: 20px; margin-bottom: 6px;">Architectural Portfolio</h3><p style="color: var(--text-muted); font-size: 14px;">Minimalist physical & web catalog for Tokyo design pavilion.</p></div></div>
    </div>
  </main>

  <footer>
    <p>&copy; {name}. Selected Commissions • Theme: {theme['name']} • Layout: {layout.title()}.</p>
    <p class="concept-tag">Concept preview, not approved by the business.</p>
  </footer>

  <script>
    function inquire() {{ alert('Project inquiry submitted to ' + '{name}' + '!'); }}
  </script>
</body>
</html>"""


# ─────────────────────────────────────────────────────────────────────────────
# 8. UNIVERSAL BUSINESS
# ─────────────────────────────────────────────────────────────────────────────
def build_universal_business_html(data: Dict[str, Any], theme: Dict[str, str], layout: str) -> str:
    name = data.get("name", "Prime Solutions")
    category = data.get("category", "Professional Services")
    city = data.get("city", "Downtown")
    tagline = data.get("tagline") or f"Excellence, Integrity & Results in {city}"
    phone = data.get("phone", "+1 (555) 234-8899")

    common_styles = _get_common_styles(theme)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{name}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Outfit:wght@700;800;900&display=swap" rel="stylesheet">
  <style>
    {common_styles}
    .hero {{ padding: 140px 6% 60px; text-align: center; max-width: 850px; margin: 0 auto; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; padding: 40px 6% 80px; max-width: 1100px; margin: 0 auto; }}
    .card {{ background: var(--surface); border: 1px solid var(--surface-border); border-radius: 20px; padding: 28px; box-shadow: var(--card-shadow); }}
  </style>
</head>
<body>
  <header>
    <a href="#" class="brand-title"><div class="brand-badge">⚡</div><span>{name}</span></a>
    <nav>
      <a href="#services">Services</a>
      <a href="#about">About</a>
      <a href="#contact">Contact</a>
    </nav>
    <button class="header-btn" onclick="contact()">Contact Team</button>
  </header>

  <main>
    <section class="hero">
      <span style="background: var(--badge-bg); border: 1px solid var(--badge-border); color: var(--primary); padding: 6px 16px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase;">{category} • {city}</span>
      <h1 style="font-family: var(--font-heading); font-size: clamp(38px, 6vw, 68px); font-weight: 800; line-height: 1.15; margin: 18px 0;">{tagline}</h1>
      <p style="color: var(--text-muted); font-size: 18px; margin-bottom: 28px;">Delivering high-caliber solutions, verified industry track records, and dedicated client service.</p>
      <button class="header-btn" onclick="contact()">Get in Touch</button>
    </section>

    <div class="grid" id="services">
      <div class="card"><h3 style="font-family: var(--font-heading); font-size: 20px; margin-bottom: 8px;">Tailored Strategies</h3><p style="color: var(--text-muted); font-size: 14px;">Bespoke solutions designed specifically around your operational goals.</p></div>
      <div class="card"><h3 style="font-family: var(--font-heading); font-size: 20px; margin-bottom: 8px;">Verified Experience</h3><p style="color: var(--text-muted); font-size: 14px;">Decades of combined technical and consultative domain excellence.</p></div>
      <div class="card"><h3 style="font-family: var(--font-heading); font-size: 20px; margin-bottom: 8px;">Rapid Support</h3><p style="color: var(--text-muted); font-size: 14px;">Direct communication lines with our specialists whenever you need guidance.</p></div>
    </div>
  </main>

  <footer>
    <p>&copy; {name}. Direct Line: {phone} • Theme: {theme['name']} • Layout: {layout.title()}.</p>
    <p class="concept-tag">Concept preview, not approved by the business.</p>
  </footer>

  <script>
    function contact() {{ alert('Message sent to ' + '{name}' + '!'); }}
  </script>
</body>
</html>"""


def generate_website_html(data: Dict[str, Any]) -> str:
    """Master router: selects the domain generator, theme palette, and layout format."""
    category = data.get("category", "")
    name = data.get("name", "")
    description = data.get("description", "")
    domain = detect_domain_type(category, name, description)

    theme, layout = pick_theme_and_layout(data)

    if domain == "movie":
        return build_movie_recommendations_html(data, theme, layout)
    elif domain == "ecommerce":
        return build_ecommerce_shop_html(data, theme, layout)
    elif domain == "fitness":
        return build_fitness_gym_html(data, theme, layout)
    elif domain == "salon":
        return build_salon_spa_html(data, theme, layout)
    elif domain == "clinic":
        return build_clinic_medical_html(data, theme, layout)
    elif domain == "saas":
        return build_tech_saas_html(data, theme, layout)
    elif domain == "portfolio":
        return build_portfolio_agency_html(data, theme, layout)
    elif domain == "restaurant":
        from .website_builder import _build_restaurant_html
        return _build_restaurant_html(data)
    else:
        return build_universal_business_html(data, theme, layout)


__all__ = [
    "THEME_PALETTES",
    "detect_domain_type",
    "pick_theme_and_layout",
    "generate_website_html",
    "build_movie_recommendations_html",
    "build_ecommerce_shop_html",
    "build_fitness_gym_html",
    "build_salon_spa_html",
    "build_clinic_medical_html",
    "build_tech_saas_html",
    "build_portfolio_agency_html",
    "build_universal_business_html",
]
