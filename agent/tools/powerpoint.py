"""
AKARI-Slides Senior Presentation Designer Engine: Professional .pptx generator.

Designed for high-impact executive decks, pitch presentations, technical deep-dives,
and academic lectures.

Key Architecture:
  * 60-30-10 Curated Palettes: Dark hero/closing slides, clean crisp content slides.
  * Diverse Visual Layouts: Never repeats the same layout twice in a row.
    - Title Hero (Dark cinematic framing with category badge & author tag)
    - Big Stat / Metric Cards (60pt bold callouts with descriptive units & labels)
    - 3-Column Feature Cards (Accent top pills, bold headers, concise bullets)
    - 2x2 Grid (4 structured quadrants with numbered badges)
    - Two-Column Comparison (Current Challenge vs Strategic Solution)
    - Horizontal Timeline (Sequential numbered milestones 01-04)
    - Visionary Quote (Large 24pt italicized central card with attribution)
    - Structured Content (Left highlighted takeaway box + Right details)
    - Closing Hero (Summary takeaways, call-to-action cards, Q&A)
  * Speaker Notes attached to every slide.
  * Engine Routing: Local python-pptx (default high-fidelity vector builder),
    PptxGenJS support, and Gamma API integration if configured.
"""

from __future__ import annotations

import os
import re
import sys
import json
import hashlib
import platform
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..registry import ToolError, register
from .files import HOME, FOLDER_ALIASES

DEFAULT_SAVE_DIR = HOME / "Desktop"

# ── 60-30-10 Professional Designer Palettes ─────────────────────────────────
THEME_PALETTES: Dict[str, Dict[str, Any]] = {
    "tech_obsidian": {
        "name": "Tech Obsidian",
        "dark_bg": (11, 15, 25),          # 60%
        "dark_card": (22, 30, 46),        # 30%
        "dark_title": (255, 255, 255),
        "dark_body": (203, 213, 225),
        "light_bg": (248, 250, 252),      # 60%
        "light_card": (255, 255, 255),    # 30%
        "light_card_border": (226, 232, 240),
        "light_title": (15, 23, 42),
        "light_body": (51, 65, 85),
        "accent": (14, 165, 233),         # 10% sharp accent (Sky)
        "accent_light": (224, 242, 254),
        "secondary": (99, 102, 241),      # Indigo
    },
    "growth_emerald": {
        "name": "Growth Emerald",
        "dark_bg": (6, 38, 26),
        "dark_card": (13, 56, 39),
        "dark_title": (255, 255, 255),
        "dark_body": (209, 250, 229),
        "light_bg": (246, 252, 248),
        "light_card": (255, 255, 255),
        "light_card_border": (209, 250, 229),
        "light_title": (6, 78, 59),
        "light_body": (31, 41, 55),
        "accent": (16, 185, 129),         # Vivid Emerald
        "accent_light": (209, 250, 229),
        "secondary": (4, 120, 87),
    },
    "luxe_gold": {
        "name": "Luxe Gold",
        "dark_bg": (17, 24, 39),
        "dark_card": (31, 41, 55),
        "dark_title": (255, 255, 255),
        "dark_body": (229, 231, 235),
        "light_bg": (254, 252, 247),
        "light_card": (255, 255, 255),
        "light_card_border": (243, 244, 246),
        "light_title": (24, 24, 27),
        "light_body": (63, 63, 70),
        "accent": (245, 158, 11),         # Royal Gold/Amber
        "accent_light": (254, 243, 199),
        "secondary": (180, 83, 9),
    },
    "cyber_neon": {
        "name": "Cyber Neon",
        "dark_bg": (9, 13, 24),
        "dark_card": (24, 20, 48),
        "dark_title": (255, 255, 255),
        "dark_body": (233, 213, 255),
        "light_bg": (250, 248, 255),
        "light_card": (255, 255, 255),
        "light_card_border": (243, 232, 255),
        "light_title": (30, 27, 75),
        "light_body": (76, 29, 149),
        "accent": (236, 72, 153),         # Neon Magenta
        "accent_light": (252, 231, 243),
        "secondary": (168, 85, 247),
    },
    "nordic_clean": {
        "name": "Nordic Clean",
        "dark_bg": (30, 41, 59),
        "dark_card": (51, 65, 85),
        "dark_title": (255, 255, 255),
        "dark_body": (241, 245, 249),
        "light_bg": (248, 250, 252),
        "light_card": (255, 255, 255),
        "light_card_border": (226, 232, 240),
        "light_title": (15, 23, 42),
        "light_body": (71, 85, 105),
        "accent": (99, 102, 241),         # Indigo
        "accent_light": (224, 231, 255),
        "secondary": (79, 70, 229),
    },
    "crimson_impact": {
        "name": "Crimson Impact",
        "dark_bg": (24, 24, 27),
        "dark_card": (39, 39, 42),
        "dark_title": (255, 255, 255),
        "dark_body": (244, 244, 245),
        "light_bg": (255, 248, 248),
        "light_card": (255, 255, 255),
        "light_card_border": (254, 226, 226),
        "light_title": (28, 25, 23),
        "light_body": (68, 64, 60),
        "accent": (244, 63, 94),          # Vivid Rose / Crimson
        "accent_light": (255, 228, 230),
        "secondary": (225, 29, 72),
    },
}

# Compatibility aliases
THEME_PALETTES["modern_dark"] = THEME_PALETTES["tech_obsidian"]
THEME_PALETTES["cyber_cyan"] = THEME_PALETTES["cyber_neon"]
THEME_PALETTES["minimal_white"] = THEME_PALETTES["nordic_clean"]
THEME_PALETTES["corporate_blue"] = THEME_PALETTES["tech_obsidian"]
THEME_PALETTES["sunset_gradient"] = THEME_PALETTES["crimson_impact"]
THEME_PALETTES["emerald_green"] = THEME_PALETTES["growth_emerald"]


def _resolve_save_path(filename: Optional[str], folder: Optional[str]) -> Path:
    target_dir = DEFAULT_SAVE_DIR
    if folder:
        key = folder.strip().lower()
        if key in FOLDER_ALIASES:
            target_dir = FOLDER_ALIASES[key]
        else:
            p = Path(os.path.expanduser(folder))
            if p.exists() and p.is_dir():
                target_dir = p

    target_dir.mkdir(parents=True, exist_ok=True)
    if not filename or not filename.strip():
        filename = "Presentation.pptx"
    else:
        filename = filename.strip()
        if not filename.lower().endswith(".pptx"):
            filename += ".pptx"
    filename = re.sub(r'[\\/*?:"<>|]', "", filename)
    return target_dir / filename


def _open_file_in_os(path: Path) -> bool:
    try:
        if platform.system() == "Windows":
            os.startfile(str(path))
            return True
        elif platform.system() == "Darwin":
            subprocess.Popen(["open", str(path)])
            return True
        else:
            subprocess.Popen(["xdg-open", str(path)])
            return True
    except Exception as e:
        print(f"[PowerPoint] Error opening presentation: {e}")
        return False


def _auto_pick_palette(topic: str) -> str:
    t = topic.lower()
    if any(k in t for k in ["money", "finance", "invest", "revenue", "grow", "market", "sales", "sustain", "climate", "eco"]):
        return "growth_emerald"
    elif any(k in t for k in ["luxury", "gold", "premium", "brand", "real estate", "leader", "executive"]):
        return "luxe_gold"
    elif any(k in t for k in ["gaming", "game", "cyber", "ai", "crypto", "web3", "vr", "future", "space"]):
        return "cyber_neon"
    elif any(k in t for k in ["health", "med", "crisis", "warning", "urgent", "security", "defense", "risk"]):
        return "crimson_impact"
    elif any(k in t for k in ["design", "arch", "minimal", "clean", "nordic", "code", "dev"]):
        return "nordic_clean"
    return "tech_obsidian"


def fetch_presentation_image(query: str, topic: str = "", save_dir: Optional[Path] = None) -> Optional[Path]:
    """
    Searches Bing Images and Wikimedia Commons for high-resolution graphics, photos,
    or workflow diagrams matching the topic/query, downloads and caches them locally
    for slide embedding.
    """
    if not save_dir:
        save_dir = Path.home() / ".akari" / "pptx_images"
    save_dir.mkdir(parents=True, exist_ok=True)

    clean_q = f"{topic} {query}".strip() if topic and topic.lower() not in query.lower() else query.strip()
    cache_key = hashlib.md5(clean_q.encode("utf-8")).hexdigest()[:12]

    # Return cached image if already downloaded
    for ext in [".png", ".jpg", ".jpeg"]:
        candidate = save_dir / f"img_{cache_key}{ext}"
        if candidate.exists() and candidate.stat().st_size > 2000:
            return candidate

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    }

    # 1. Bing Images search for rich photography and professional diagrams
    try:
        bing_url = f"https://www.bing.com/images/search?q={urllib.parse.quote(clean_q)}&form=HDRSC2&first=1"
        req = urllib.request.Request(bing_url, headers=headers)
        with urllib.request.urlopen(req, timeout=5) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
            matches = re.findall(r'murl&quot;:&quot;(https?://[^&]+?)&quot;', html)
            if not matches:
                matches = re.findall(r'"murl":"(https?://[^"]+?)"', html)

            for m in matches[:6]:
                if any(m.lower().endswith(e) for e in [".jpg", ".jpeg", ".png", ".webp"]) or "unsplash" in m:
                    try:
                        ext = ".jpg" if ".jpg" in m.lower() or ".jpeg" in m.lower() else ".png"
                        out_file = save_dir / f"img_{cache_key}{ext}"
                        img_req = urllib.request.Request(m, headers={"User-Agent": headers["User-Agent"]})
                        with urllib.request.urlopen(img_req, timeout=5) as img_resp, open(out_file, "wb") as f:
                            content = img_resp.read()
                            if len(content) > 4000:
                                f.write(content)
                                print(f"[PowerPoint] Successfully downloaded slide image: {m}")
                                return out_file
                    except Exception:
                        continue
    except Exception as e:
        print(f"[PowerPoint] Bing image search notice: {e}")

    # 2. Wikimedia Commons high-resolution fallback
    try:
        wiki_url = f"https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch={urllib.parse.quote(clean_q)}&gsrlimit=5&prop=pageimages&piprop=thumbnail&pithumbsize=1200"
        req = urllib.request.Request(wiki_url, headers={"User-Agent": "AkariPresentationBot/1.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            pages = data.get("query", {}).get("pages", {})
            for pid, p in pages.items():
                thumb = p.get("thumbnail", {}).get("source")
                if thumb and thumb.startswith("http"):
                    try:
                        ext = ".png" if ".png" in thumb.lower() else ".jpg"
                        out_file = save_dir / f"img_{cache_key}{ext}"
                        img_req = urllib.request.Request(thumb, headers={"User-Agent": "AkariPresentationBot/1.0"})
                        with urllib.request.urlopen(img_req, timeout=5) as img_resp, open(out_file, "wb") as f:
                            content = img_resp.read()
                            if len(content) > 3000:
                                f.write(content)
                                print(f"[PowerPoint] Successfully downloaded Wikimedia slide image: {thumb}")
                                return out_file
                    except Exception:
                        continue
    except Exception as e:
        print(f"[PowerPoint] Wikimedia image search notice: {e}")

    return None


@register("searchPresentationImages")
def search_presentation_images(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Search and download a high-resolution visual graphic or diagram from the web for presentations.
    """
    query = args.get("query") or args.get("q")
    topic = args.get("topic") or ""
    if not query:
        raise ToolError("Parameter 'query' is required.")
    img_path = fetch_presentation_image(str(query), topic=str(topic))
    if img_path and img_path.exists():
        return {
            "result": f"Found and downloaded image for '{query}'.",
            "path": str(img_path),
            "size_bytes": img_path.stat().st_size
        }
    return {"result": f"No high-resolution image could be downloaded for '{query}'. A clean native vector layout will be used."}


def _build_storyline_slides(topic: str, audience: str = "Stakeholders", purpose: str = "Strategic Overview") -> List[Dict[str, Any]]:
    """
    Standard professional 10-slide storyline equipped with FLOWCHARTS, ARCHITECTURE DIAGRAMS,
    REAL DOWNLOADED IMAGES, and METRIC CALLOUTS:
    Title > Problem/Context > Quantitative Evidence > Process Flowchart > Architecture Diagram >
    Visual Solution Deep-Dive > Decision Logic Gate > Roadmap > Quote > Closing Next Steps
    """
    return [
        {
            "layout": "two_column",
            "category": "PROBLEM & CONTEXT",
            "title": f"The Landscape: Why {topic} Matters Now",
            "subtitle": "Current operational friction vs the strategic transformation window",
            "col1_title": "Current Bottlenecks & Legacy Overhead",
            "col1_points": [
                "Fragmented systems causing operational latency",
                "High manual overhead and repetitive administrative tasks",
                "Difficulty scaling output without compounding errors",
                "Growing urgency from leadership to modernize and automate"
            ],
            "col2_title": "The Strategic Transformation",
            "col2_points": [
                "10x execution velocity through unified intelligent workflows",
                "Continuous automated processing with sub-second feedback loops",
                "Audited end-to-end data pipeline from intake to impact",
                "Sustainable market differentiation and executive ROI"
            ],
            "notes": f"Set the stage for {audience}. Emphasize that continuing status-quo processes incurs mounting overhead, whereas moving proactively creates massive operational leverage."
        },
        {
            "layout": "big_stat",
            "category": "QUANTITATIVE EVIDENCE",
            "title": f"Measuring the Impact: Key Performance Indicators",
            "subtitle": "Empirical metrics proving strategic transformation",
            "stats": [
                {"number": "85%", "label": "EFFICIENCY GAIN", "desc": "Reduction in manual turnaround time"},
                {"number": "10x", "label": "SCALING MULTIPLIER", "desc": "Output throughput without headcount bloat"},
                {"number": "< 1s", "label": "RESPONSE LATENCY", "desc": "Instantaneous interactive execution speed"}
            ],
            "takeaway": "Key Takeaway: The quantitative shift delivers both immediate cost containment and scalable multi-year ROI.",
            "notes": "Highlight the dramatic numbers. Frame 85% efficiency gain and 10x throughput as the core justification for stakeholder buy-in."
        },
        {
            "layout": "flowchart",
            "category": "PROCESS WORKFLOW",
            "title": "End-to-End Operational Workflow Pipeline",
            "subtitle": "Sequential automated lifecycle connecting multimodal input to verified output",
            "steps": [
                {
                    "num": "01",
                    "name": "Intake & Ingestion",
                    "desc": "Multimodal signal intake, document parsing, and real-time context normalization.",
                    "out": "Normalized Context"
                },
                {
                    "num": "02",
                    "name": "Cognitive Synthesis",
                    "desc": "Context reasoning, policy checking, and structured execution plan generation.",
                    "out": "Action Blueprint"
                },
                {
                    "num": "03",
                    "name": "Autonomous Execution",
                    "desc": "Direct tool invocation, native vector rendering, and artifact synthesis.",
                    "out": "Production Artifact"
                },
                {
                    "num": "04",
                    "name": "Verification & Scale",
                    "desc": "Automated QA inspection, telemetry audit logging, and stakeholder delivery.",
                    "out": "Closed-Loop Success"
                }
            ],
            "takeaway": "Pipeline Standard: 100% deterministic progression with automated verification checkpoints between stages.",
            "notes": "Walk the audience through each stage of the flowchart from left to right. Point out how the directional arrows indicate continuous, frictionless data movement."
        },
        {
            "layout": "architecture",
            "category": "SYSTEM ARCHITECTURE",
            "title": "Multi-Tier Enterprise Architecture",
            "subtitle": "Three interconnected layers engineered for high-availability and security",
            "tiers": [
                {
                    "title": "TIER 1: CLIENT & INTERACTION LAYER",
                    "badge": "EXPERIENCE",
                    "modules": ["Desktop Shell Application", "Real-Time WebRTC Voice/Audio", "Interactive Dashboard & Canvas", "Enterprise API SDK"]
                },
                {
                    "title": "TIER 2: INTELLIGENCE & ORCHESTRATION CORE",
                    "badge": "COGNITION",
                    "modules": ["Multimodal LLM Reasoning", "Autonomous Tool Router", "Context Memory Store", "Security & Guardrails Engine"]
                },
                {
                    "title": "TIER 3: DATA & INFRASTRUCTURE FOUNDATION",
                    "badge": "FOUNDATION",
                    "modules": ["Vector Semantic Index", "Local Encrypted Database", "Cloud Connectors & Storage", "Telemetry & Audit Vault"]
                }
            ],
            "notes": "Highlight how the architecture separates user presentation from the intelligence engine and data foundation, ensuring enterprise-grade scalability and data privacy."
        },
        {
            "layout": "image_split",
            "category": "VISUAL SOLUTION",
            "title": f"Solution Deep-Dive: {topic} in Action",
            "subtitle": "Visual representation and architectural advantages in live production",
            "image_query": f"{topic} technology workflow diagram",
            "highlight_title": "Core Technical Differentiators",
            "points": [
                "Full visual alignment across engineering and executive teams",
                "Deterministic execution logic preventing hallucination or error drift",
                "Sub-second latency with resilient offline and local fallback capabilities",
                "Native Office and document compatibility requiring zero workflow retraining"
            ],
            "image_caption": f"System Architecture & Operational View for {topic}",
            "notes": "Direct attention to the visual diagram on the left. Explain how this interface translates high-level stakeholder intent into verified machine execution."
        },
        {
            "layout": "decision_flow",
            "category": "DECISION ARCHITECTURE",
            "title": "Autonomous Decision Gate & Routing Logic",
            "subtitle": "Intelligent triage separating automated fast-path from supervised review",
            "input_node": "Operational Event Intake\n& Semantic Intent Classification",
            "decision_rule": "Policy & Quality\nValidation Gate",
            "path_a": "Fast-Track Autonomous Path (92% Volume): Instant automated validation, asset generation, and delivery without human bottleneck.",
            "path_b": "Human-in-the-Loop Supervision (8% Volume): Automated triage with rich context summaries dispatched to specialist operators for review.",
            "notes": "Explain the decision gate. Emphasize that 92% of operational tasks flow through the high-velocity automated path, while edge cases are seamlessly flagged for supervisor oversight."
        },
        {
            "layout": "cards_3col",
            "category": "CORE PILLARS",
            "title": f"Strategic Pillars Driving Success",
            "subtitle": "Three fundamental operational disciplines underpinning long-term ROI",
            "cards": [
                {
                    "title": "01. Autonomous Speed",
                    "badge": "VELOCITY",
                    "points": [
                        "Real-time processing with sub-second feedback loops",
                        "Elimination of repetitive manual bottlenecks",
                        "Continuous 24/7 background productivity"
                    ]
                },
                {
                    "title": "02. Multimodal Fidelity",
                    "badge": "INTELLIGENCE",
                    "points": [
                        "Cross-channel audio, vision, and semantic reasoning",
                        "Deep contextual memory across documents and workflows",
                        "Zero-hallucination instruction precision"
                    ]
                },
                {
                    "title": "03. Enterprise Governance",
                    "badge": "SECURITY",
                    "points": [
                        "Full local encryption and granular permission controls",
                        "Audit-ready telemetry and reproducible history",
                        "Seamless integration into existing enterprise stacks"
                    ]
                }
            ],
            "notes": "Summarize the three core pillars that guarantee operational stability, speed, and governance across all deployments."
        },
        {
            "layout": "timeline",
            "category": "IMPLEMENTATION ROADMAP",
            "title": "Phased Implementation & Rollout Schedule",
            "subtitle": "Clear, risk-mitigated milestones from foundation to full scale",
            "steps": [
                {"phase": "PHASE 1", "title": "Discovery & Alignment", "desc": "Stakeholder mapping, environment setup, and baseline benchmarking."},
                {"phase": "PHASE 2", "title": "Core Integration", "desc": "Data connectors, pipeline hardening, and automated test suite."},
                {"phase": "PHASE 3", "title": "Controlled Pilot", "desc": "Closed user group validation, telemetry review, and benchmark testing."},
                {"phase": "PHASE 4", "title": "Full Production", "desc": "Enterprise deployment, team enablement, and automated maintenance."}
            ],
            "notes": "Reassure stakeholders that rollout is disciplined and phased. Phase 1 through 4 ensure zero disruption to current business continuity."
        },
        {
            "layout": "quote",
            "category": "STRATEGIC VISION",
            "title": "Guiding Philosophy",
            "subtitle": "The foundational mindset defining our approach",
            "quote": f"Technology is at its best when it renders complexity invisible—empowering humans to operate at the peak of their creative and strategic potential.",
            "attribution": "AKARI-Slides Architecture Manifesto",
            "notes": "Pause here to let the core philosophy resonate with the room before summarizing actionable next steps."
        },
        {
            "layout": "closing",
            "category": "NEXT STEPS",
            "title": f"Empowering the Future: Thank You",
            "subtitle": f"Prepared for {audience} • Ready for Collaborative Execution",
            "takeaways": [
                "Next Step 1: Review project timeline and milestone approval",
                "Next Step 2: Establish governance lead and pilot criteria",
                "Next Step 3: Kick off Phase 1 foundation sprint"
            ],
            "qa_text": "Open floor for discussion, Q&A, and technical clarifications.",
            "notes": "Conclude warmly, thank the audience for their time, and invite questions from leadership."
        }
    ]


def _enrich_and_visualize_deck(slides: List[Dict[str, Any]], topic: str) -> List[Dict[str, Any]]:
    """
    Enforces visual diversity and guarantees that EVERY presentation includes flowcharts,
    architecture diagrams, real downloaded web images, and visual cards—even if an LLM
    or user provides plain bullet text without specifying layouts.
    """
    enriched = []
    has_flowchart = False
    has_architecture = False
    has_image = False

    for idx, s in enumerate(slides):
        item = dict(s)
        t = (item.get("title") or "").lower()
        sub = (item.get("subtitle") or "").lower()
        layout = item.get("layout")

        # 1. Infer flowchart if matching process keywords
        if layout in ("flowchart", "process_flow") or any(k in t or k in sub for k in ["workflow", "process", "pipeline", "lifecycle", "stages", "step", "journey", "how it works", "evolution"]):
            item["layout"] = "flowchart"
            has_flowchart = True
            if not item.get("steps"):
                pts = item.get("points") or ["Intake & Signal Capture", "Cognitive Reasoning & Triage", "Autonomous Pipeline Action", "Verification & Closed Loop"]
                while len(pts) < 4:
                    pts.append(f"Stage {len(pts)+1} Completion")
                item["steps"] = [
                    {"num": f"0{i+1}", "name": p.split(":")[0].strip() if ":" in p else p.split("—")[0].strip()[:24], "desc": p.split(":")[1].strip() if ":" in p else p[:60], "out": f"Phase {i+1} Output"}
                    for i, p in enumerate(pts[:4])
                ]

        # 2. Infer architecture if matching system/layers keywords
        elif layout in ("architecture", "system_diagram") or any(k in t or k in sub for k in ["architecture", "system", "infrastructure", "layers", "stack", "modules", "platform", "framework", "inputs"]):
            item["layout"] = "architecture"
            has_architecture = True
            if not item.get("tiers"):
                pts = item.get("points") or []
                item["tiers"] = [
                    {"title": "TIER 1: CLIENT & INTERACTION LAYER", "modules": [pts[0][:24]] if len(pts) > 0 else ["Web & Desktop Shell", "Voice Interface", "Mobile API", "SDK"]},
                    {"title": "TIER 2: INTELLIGENCE & ORCHESTRATION CORE", "modules": [pts[1][:24]] if len(pts) > 1 else ["LLM Reasoning Core", "Tool Router", "Context Memory", "Guardrails"]},
                    {"title": "TIER 3: DATA & INFRASTRUCTURE FOUNDATION", "modules": [pts[2][:24]] if len(pts) > 2 else ["Vector Knowledge Store", "Encrypted DB", "Cloud Storage", "Telemetry Vault"]}
                ]

        # 3. Infer image split if matching visual/solution/demo/real-world keywords
        elif layout in ("image_split", "image_feature", "visual_spotlight") or any(k in t or k in sub for k in ["solution", "in action", "real-world", "application", "deep-dive", "overview", "visual", "demo", "hardware", "frontier", "robot"]):
            item["layout"] = "image_split"
            has_image = True
            if not item.get("image_query"):
                item["image_query"] = f"{topic} {item.get('title', '')} diagram photo"

        # 4. Infer decision flow
        elif layout in ("decision_flow", "branching_flow") or any(k in t or k in sub for k in ["decision", "routing", "rules", "triage", "logic", "gate"]):
            item["layout"] = "decision_flow"

        # 5. Infer timeline / roadmap
        elif layout == "timeline" or any(k in t or k in sub for k in ["roadmap", "timeline", "phases", "rollout", "schedule", "milestones"]):
            item["layout"] = "timeline"
            if not item.get("steps"):
                pts = item.get("points") or ["Discovery & Audit", "Integration Sprint", "Controlled Pilot", "Full Scale Production"]
                while len(pts) < 4:
                    pts.append(f"Phase {len(pts)+1} Launch")
                item["steps"] = [
                    {"phase": f"PHASE {i+1}", "title": p.split(":")[0].strip() if ":" in p else f"Stage {i+1}", "desc": p.split(":")[1].strip() if ":" in p else p[:50]}
                    for i, p in enumerate(pts[:4])
                ]

        # 6. Infer big stat
        elif layout == "big_stat" or any(k in t or k in sub for k in ["kpi", "metric", "impact", "numbers", "performance", "growth", "results"]):
            item["layout"] = "big_stat"
            if not item.get("stats"):
                item["stats"] = [
                    {"number": "85%", "label": "EFFICIENCY GAIN", "desc": "Reduction in manual turnaround time"},
                    {"number": "10x", "label": "SCALING MULTIPLIER", "desc": "Throughput output acceleration"},
                    {"number": "< 1s", "label": "RESPONSE LATENCY", "desc": "Instantaneous interactive speed"}
                ]

        # 7. Infer two column
        elif layout == "two_column" or any(k in t or k in sub for k in ["vs", "comparison", "challenge", "bottlenecks", "problem", "friction"]):
            item["layout"] = "two_column"

        enriched.append(item)

    # GUARANTEE VISUAL QUOTA FOR DECKS WITH 3+ SLIDES:
    # 1. Guarantee at least one Flowchart with connecting arrows
    if not has_flowchart and len(enriched) >= 3:
        target_idx = 1 if len(enriched) <= 4 else 2
        enriched[target_idx]["layout"] = "flowchart"
        pts = enriched[target_idx].get("points") or ["Signal Intake", "Cognitive Synthesis", "Tool Execution", "Verification Check"]
        while len(pts) < 4:
            pts.append(f"Milestone {len(pts)+1}")
        enriched[target_idx]["steps"] = [
            {"num": f"0{i+1}", "name": p.split(":")[0].strip() if ":" in p else p[:22], "desc": p.split(":")[1].strip() if ":" in p else p[:50], "out": f"Stage {i+1} Output"}
            for i, p in enumerate(pts[:4])
        ]

    # 2. Guarantee at least one Multi-Tier Architecture Diagram
    if not has_architecture and len(enriched) >= 4:
        target_idx = 2 if enriched[1].get("layout") == "flowchart" else 3
        if target_idx < len(enriched):
            enriched[target_idx]["layout"] = "architecture"
            enriched[target_idx]["tiers"] = [
                {"title": "TIER 1: CLIENT & INTERACTION LAYER", "modules": ["Desktop Shell Application", "Voice/WebRTC Streams", "Canvas UI", "API SDK"]},
                {"title": "TIER 2: INTELLIGENCE & ORCHESTRATION CORE", "modules": ["Multimodal LLM Core", "Autonomous Tool Router", "Context Memory Store", "Guardrails Engine"]},
                {"title": "TIER 3: DATA & INFRASTRUCTURE FOUNDATION", "modules": ["Vector Semantic Index", "Local Encrypted Database", "Cloud Connectors", "Telemetry Vault"]}
            ]

    # 3. Guarantee at least one Real Downloaded Web Image slide
    if not has_image and len(enriched) >= 3:
        for idx in range(len(enriched)):
            if enriched[idx].get("layout") not in ("flowchart", "architecture", "closing"):
                enriched[idx]["layout"] = "image_split"
                enriched[idx]["image_query"] = f"{topic} {enriched[idx].get('title', '')} technology diagram"
                break

    return enriched


@register("createPresentation")
def create_presentation(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate an awesome, fully editable professional PowerPoint presentation (.pptx).
    Follows senior designer rules: 60-30-10 palette, varied visual layouts (no repetitive bullets),
    native vector cards & stat callouts, speaker notes, and auto-opens in PowerPoint.
    """
    topic: str = args.get("topic") or args.get("title") or "Executive Strategy"
    title: str = args.get("title") or topic
    subtitle: str = args.get("subtitle") or "Strategic Vision & Implementation Roadmap"
    audience: str = args.get("audience") or "Stakeholders"
    purpose: str = args.get("purpose") or "Executive Presentation"
    theme_name: str = str(args.get("theme") or "").strip().lower()
    filename: Optional[str] = args.get("filename")
    save_folder: Optional[str] = args.get("save_folder") or "desktop"
    open_after: bool = args.get("open_after", True)
    custom_slides: Optional[List[Dict[str, Any]]] = args.get("slides")

    if not theme_name or theme_name not in THEME_PALETTES:
        theme_name = _auto_pick_palette(topic)
    palette = THEME_PALETTES.get(theme_name, THEME_PALETTES["tech_obsidian"])

    out_path = _resolve_save_path(filename or f"{title.replace(' ', '_')}.pptx", save_folder)

    # Build slide deck (guarantee rich visual layouts, flowcharts, architectures, and images)
    if custom_slides and len(custom_slides) > 0:
        deck_slides = _enrich_and_visualize_deck(custom_slides, topic=topic)
    else:
        deck_slides = _build_storyline_slides(topic, audience=audience, purpose=purpose)

    used_engine = "python-pptx (AKARI-Slides Native Vector Engine)"
    slide_count = 0

    try:
        from pptx import Presentation
        from pptx.util import Inches, Pt
        from pptx.dml.color import RGBColor
        from pptx.enum.shapes import MSO_SHAPE
        from pptx.enum.text import PP_ALIGN

        prs = Presentation()
        # 16:9 widescreen format (13.333 x 7.5 inches)
        prs.slide_width = Inches(13.333)
        prs.slide_height = Inches(7.5)
        blank_layout = prs.slide_layouts[6]

        def fill_shape(shape, rgb, line_rgb=None, line_width=1):
            shape.fill.solid()
            shape.fill.fore_color.rgb = RGBColor(*rgb)
            if line_rgb:
                shape.line.color.rgb = RGBColor(*line_rgb)
                shape.line.width = Pt(line_width)
            else:
                shape.line.fill.background()

        def set_bg(slide, rgb):
            bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(7.5))
            fill_shape(bg, rgb)

        def add_category_badge(slide, text: str, top_in=0.6, left_in=1.0, is_dark=False):
            badge = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(left_in), Inches(top_in), Inches(2.8), Inches(0.42))
            badge_bg = palette["dark_card"] if is_dark else palette["accent_light"]
            badge_border = palette["accent"]
            fill_shape(badge, badge_bg, badge_border, 1)
            tf = badge.text_frame
            tf.word_wrap = True
            p = tf.paragraphs[0]
            p.text = text.upper()
            p.font.bold = True
            p.font.size = Pt(11)
            p.font.name = "Segoe UI"
            p.font.color.rgb = RGBColor(*(palette["accent"] if not is_dark else palette["dark_title"]))
            p.alignment = PP_ALIGN.CENTER

        def add_header(slide, title_text: str, subtitle_text: Optional[str] = None, category: Optional[str] = None):
            set_bg(slide, palette["light_bg"])
            add_category_badge(slide, category or "STRATEGIC BRIEFING", top_in=0.55, left_in=1.0, is_dark=False)

            t_box = slide.shapes.add_textbox(Inches(1.0), Inches(1.05), Inches(11.3), Inches(0.9))
            tf = t_box.text_frame
            tf.word_wrap = True
            p = tf.paragraphs[0]
            p.text = title_text
            p.font.bold = True
            p.font.size = Pt(30)
            p.font.name = "Segoe UI"
            p.font.color.rgb = RGBColor(*palette["light_title"])

            if subtitle_text:
                s_box = slide.shapes.add_textbox(Inches(1.0), Inches(1.8), Inches(11.3), Inches(0.5))
                stf = s_box.text_frame
                stf.word_wrap = True
                sp = stf.paragraphs[0]
                sp.text = subtitle_text
                sp.font.size = Pt(15)
                sp.font.name = "Segoe UI"
                sp.font.color.rgb = RGBColor(*palette["light_body"])

        def attach_notes(slide, notes_text: Optional[str]):
            if notes_text:
                try:
                    notes_slide = slide.notes_slide
                    notes_slide.notes_text_frame.text = notes_text
                except Exception:
                    pass

        # ── SLIDE 1: HERO TITLE SLIDE (Dark Mode) ──────────────────────────
        t_slide = prs.slides.add_slide(blank_layout)
        set_bg(t_slide, palette["dark_bg"])

        # Subtle dark card backing
        hero_card = t_slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.0), Inches(1.2), Inches(11.333), Inches(5.1))
        fill_shape(hero_card, palette["dark_card"], palette["accent"], 1.5)

        add_category_badge(t_slide, "EXECUTIVE PRESENTATION", top_in=1.8, left_in=1.6, is_dark=True)

        tb = t_slide.shapes.add_textbox(Inches(1.6), Inches(2.4), Inches(10.0), Inches(2.2))
        ttf = tb.text_frame
        ttf.word_wrap = True
        tp = ttf.paragraphs[0]
        tp.text = title
        tp.font.bold = True
        tp.font.size = Pt(42)
        tp.font.name = "Segoe UI"
        tp.font.color.rgb = RGBColor(*palette["dark_title"])

        if subtitle:
            tp2 = ttf.add_paragraph()
            tp2.text = subtitle
            tp2.font.size = Pt(20)
            tp2.font.name = "Segoe UI"
            tp2.font.color.rgb = RGBColor(*palette["dark_body"])
            tp2.space_before = Pt(14)

        # Meta line
        meta_box = t_slide.shapes.add_textbox(Inches(1.6), Inches(5.2), Inches(10.0), Inches(0.6))
        mtf = meta_box.text_frame
        mp = mtf.paragraphs[0]
        mp.text = f"Prepared by AKARI-Slides for {audience} • High-Impact Strategy Deck"
        mp.font.size = Pt(12)
        mp.font.name = "Segoe UI"
        mp.font.color.rgb = RGBColor(*palette["accent"])

        attach_notes(t_slide, f"Introduction slide for {topic}. Greet the audience warmly, outline the presentation objectives, and set expectations.")

        # ── CONTENT SLIDES (Light Mode with Visual Variations) ──────────────
        for idx, s in enumerate(deck_slides, 1):
            slide = prs.slides.add_slide(blank_layout)
            layout_type = s.get("layout", "content")
            s_title = s.get("title") or f"Section {idx}"
            s_subtitle = s.get("subtitle")
            s_category = s.get("category") or f"PART {idx:02d}"
            notes_str = s.get("notes") or f"Speaker notes for slide {idx}: elaborate on core points."

            # ── 1. Big Stat Layout ──
            if layout_type == "big_stat":
                add_header(slide, s_title, s_subtitle, s_category)
                stats = s.get("stats") or [
                    {"number": "85%", "label": "EFFICIENCY GAIN", "desc": "Reduction in cycle time"},
                    {"number": "10x", "label": "PRODUCTIVITY", "desc": "Output throughput multiplier"},
                    {"number": "< 1s", "label": "RESPONSE SPEED", "desc": "Instantaneous execution"}
                ]
                card_w = Inches(3.55)
                gap = Inches(0.33)
                top_y = Inches(2.6)

                for i, st in enumerate(stats[:3]):
                    card_x = Inches(1.0) + i * (card_w + gap)
                    scard = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, card_x, top_y, card_w, Inches(3.2))
                    fill_shape(scard, palette["light_card"], palette["light_card_border"], 1)

                    # Top accent bar
                    tbar = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, card_x, top_y, card_w, Inches(0.12))
                    fill_shape(tbar, palette["accent"])

                    st_box = slide.shapes.add_textbox(card_x + Inches(0.2), top_y + Inches(0.3), card_w - Inches(0.4), Inches(2.6))
                    stf = st_box.text_frame
                    stf.word_wrap = True

                    np = stf.paragraphs[0]
                    np.text = st.get("number", "100%")
                    np.font.bold = True
                    np.font.size = Pt(56)
                    np.font.name = "Segoe UI"
                    np.font.color.rgb = RGBColor(*palette["accent"])
                    np.alignment = PP_ALIGN.CENTER

                    lp = stf.add_paragraph()
                    lp.text = st.get("label", "KEY METRIC").upper()
                    lp.font.bold = True
                    lp.font.size = Pt(13)
                    lp.font.name = "Segoe UI"
                    lp.font.color.rgb = RGBColor(*palette["light_title"])
                    lp.space_before = Pt(8)
                    lp.alignment = PP_ALIGN.CENTER

                    dp = stf.add_paragraph()
                    dp.text = st.get("desc", "High performance standard")
                    dp.font.size = Pt(14)
                    dp.font.name = "Segoe UI"
                    dp.font.color.rgb = RGBColor(*palette["light_body"])
                    dp.space_before = Pt(8)
                    dp.alignment = PP_ALIGN.CENTER

                # Takeaway banner
                takeaway_text = s.get("takeaway") or "Strategic Takeaway: Demonstrates clear quantitative upside and capital efficiency."
                t_card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.0), Inches(6.05), Inches(11.3), Inches(0.85))
                fill_shape(t_card, palette["accent_light"], palette["accent"], 1)
                t_tf = t_card.text_frame
                t_tf.word_wrap = True
                t_p = t_tf.paragraphs[0]
                t_p.text = takeaway_text
                t_p.font.bold = True
                t_p.font.size = Pt(14)
                t_p.font.name = "Segoe UI"
                t_p.font.color.rgb = RGBColor(*palette["light_title"])
                t_p.alignment = PP_ALIGN.CENTER

            # ── 2. Cards 3-Column Layout ──
            elif layout_type == "cards_3col":
                add_header(slide, s_title, s_subtitle, s_category)
                cards = s.get("cards") or []
                if not cards:
                    points = s.get("points") or ["High velocity", "Autonomous reliability", "Adaptive scalability"]
                    cards = [
                        {"title": "Pillar A", "badge": "SPEED", "points": [points[0]] if points else ["Fast execution"]},
                        {"title": "Pillar B", "badge": "QUALITY", "points": [points[1]] if len(points) > 1 else ["High precision"]},
                        {"title": "Pillar C", "badge": "SCALE", "points": [points[2]] if len(points) > 2 else ["Enterprise scale"]},
                    ]
                card_w = Inches(3.55)
                gap = Inches(0.33)
                top_y = Inches(2.6)

                for i, cd in enumerate(cards[:3]):
                    card_x = Inches(1.0) + i * (card_w + gap)
                    cc = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, card_x, top_y, card_w, Inches(4.3))
                    fill_shape(cc, palette["light_card"], palette["light_card_border"], 1)

                    # Top badge
                    pbadge = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, card_x + Inches(0.3), top_y + Inches(0.3), Inches(1.6), Inches(0.35))
                    fill_shape(pbadge, palette["accent_light"])
                    ptf = pbadge.text_frame
                    pp = ptf.paragraphs[0]
                    pp.text = cd.get("badge", "PILLAR").upper()
                    pp.font.bold = True
                    pp.font.size = Pt(10)
                    pp.font.color.rgb = RGBColor(*palette["accent"])
                    pp.alignment = PP_ALIGN.CENTER

                    c_box = slide.shapes.add_textbox(card_x + Inches(0.3), top_y + Inches(0.8), card_w - Inches(0.6), Inches(3.2))
                    ctf = c_box.text_frame
                    ctf.word_wrap = True

                    hp = ctf.paragraphs[0]
                    hp.text = cd.get("title", f"Pillar {i+1}")
                    hp.font.bold = True
                    hp.font.size = Pt(20)
                    hp.font.name = "Segoe UI"
                    hp.font.color.rgb = RGBColor(*palette["light_title"])

                    for pt in cd.get("points", []):
                        bp = ctf.add_paragraph()
                        bp.text = f"•  {pt.strip()}"
                        bp.font.size = Pt(14)
                        bp.font.name = "Segoe UI"
                        bp.font.color.rgb = RGBColor(*palette["light_body"])
                        bp.space_before = Pt(8)

            # ── 3. Grid 2x2 Layout ──
            elif layout_type == "grid_2x2":
                add_header(slide, s_title, s_subtitle, s_category)
                quads = s.get("quadrants") or [
                    {"num": "01", "title": "Discovery", "text": "Comprehensive analysis and market mapping."},
                    {"num": "02", "title": "Architecture", "text": "Structured engineering and design frameworks."},
                    {"num": "03", "title": "Execution", "text": "Rapid, high-fidelity deployment and validation."},
                    {"num": "04", "title": "Optimization", "text": "Continuous monitoring and strategic scaling."}
                ]
                qw = Inches(5.45)
                qh = Inches(2.05)
                gap_x = Inches(0.4)
                gap_y = Inches(0.3)
                start_x = Inches(1.0)
                start_y = Inches(2.6)

                for i, q in enumerate(quads[:4]):
                    row = i // 2
                    col = i % 2
                    x = start_x + col * (qw + gap_x)
                    y = start_y + row * (qh + gap_y)

                    qc = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, qw, qh)
                    fill_shape(qc, palette["light_card"], palette["light_card_border"], 1)

                    # Number pill
                    npill = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x + Inches(0.25), y + Inches(0.25), Inches(0.7), Inches(0.7))
                    fill_shape(npill, palette["accent_light"])
                    npill_tf = npill.text_frame
                    npill_p = npill_tf.paragraphs[0]
                    npill_p.text = q.get("num", f"0{i+1}")
                    npill_p.font.bold = True
                    npill_p.font.size = Pt(16)
                    npill_p.font.color.rgb = RGBColor(*palette["accent"])
                    npill_p.alignment = PP_ALIGN.CENTER

                    q_box = slide.shapes.add_textbox(x + Inches(1.15), y + Inches(0.2), qw - Inches(1.3), qh - Inches(0.4))
                    q_tf = q_box.text_frame
                    q_tf.word_wrap = True

                    qp1 = q_tf.paragraphs[0]
                    qp1.text = q.get("title", f"Component {i+1}")
                    qp1.font.bold = True
                    qp1.font.size = Pt(18)
                    qp1.font.name = "Segoe UI"
                    qp1.font.color.rgb = RGBColor(*palette["light_title"])

                    qp2 = q_tf.add_paragraph()
                    qp2.text = q.get("text", "")
                    qp2.font.size = Pt(14)
                    qp2.font.name = "Segoe UI"
                    qp2.font.color.rgb = RGBColor(*palette["light_body"])
                    qp2.space_before = Pt(6)

            # ── 4. Two-Column Comparison Layout ──
            elif layout_type == "two_column":
                add_header(slide, s_title, s_subtitle, s_category)
                col_w = Inches(5.45)
                gap_x = Inches(0.4)
                start_x = Inches(1.0)
                top_y = Inches(2.6)

                c1_title = s.get("col1_title") or "The Challenge & Constraints"
                c1_pts = s.get("col1_points") or ["Friction points", "High overhead", "Legacy complexity"]
                c2_title = s.get("col2_title") or "The Strategic Advantage"
                c2_pts = s.get("col2_points") or ["Instant turnaround", "Scalable output", "Unified workflow"]

                # Left Column (Challenge)
                col1 = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, start_x, top_y, col_w, Inches(4.3))
                fill_shape(col1, palette["light_card"], palette["light_card_border"], 1)

                b1 = slide.shapes.add_textbox(start_x + Inches(0.35), top_y + Inches(0.3), col_w - Inches(0.7), Inches(3.6))
                b1_tf = b1.text_frame
                b1_tf.word_wrap = True
                h1 = b1_tf.paragraphs[0]
                h1.text = c1_title
                h1.font.bold = True
                h1.font.size = Pt(20)
                h1.font.name = "Segoe UI"
                h1.font.color.rgb = RGBColor(*palette["light_title"])

                for pt in c1_pts:
                    cp = b1_tf.add_paragraph()
                    cp.text = f"•  {pt.strip()}"
                    cp.font.size = Pt(15)
                    cp.font.name = "Segoe UI"
                    cp.font.color.rgb = RGBColor(*palette["light_body"])
                    cp.space_before = Pt(10)

                # Right Column (Solution - Highlighted)
                x2 = start_x + col_w + gap_x
                col2 = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x2, top_y, col_w, Inches(4.3))
                fill_shape(col2, palette["light_card"], palette["accent"], 1.5)

                b2 = slide.shapes.add_textbox(x2 + Inches(0.35), top_y + Inches(0.3), col_w - Inches(0.7), Inches(3.6))
                b2_tf = b2.text_frame
                b2_tf.word_wrap = True
                h2 = b2_tf.paragraphs[0]
                h2.text = c2_title
                h2.font.bold = True
                h2.font.size = Pt(20)
                h2.font.name = "Segoe UI"
                h2.font.color.rgb = RGBColor(*palette["accent"])

                for pt in c2_pts:
                    cp = b2_tf.add_paragraph()
                    cp.text = f"✓  {pt.strip()}"
                    cp.font.size = Pt(15)
                    cp.font.name = "Segoe UI"
                    cp.font.color.rgb = RGBColor(*palette["light_title"])
                    cp.space_before = Pt(10)

            # ── 5. Timeline / Process Steps Layout ──
            elif layout_type == "timeline":
                add_header(slide, s_title, s_subtitle, s_category)
                steps = s.get("steps") or [
                    {"phase": "PHASE 01", "title": "Discovery", "desc": "Requirements, architecture validation."},
                    {"phase": "PHASE 02", "title": "Execution", "desc": "Prototyping, implementation, and QA."},
                    {"phase": "PHASE 03", "title": "Validation", "desc": "Benchmark testing, security review."},
                    {"phase": "PHASE 04", "title": "Scaling", "desc": "Production launch, automated pipelines."}
                ]
                sw = Inches(2.65)
                sgap = Inches(0.24)
                start_x = Inches(1.0)
                top_y = Inches(2.8)

                # Connecting bar
                line = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, start_x, top_y + Inches(0.4), Inches(11.3), Inches(0.06))
                fill_shape(line, palette["accent_light"])

                for i, st in enumerate(steps[:4]):
                    x = start_x + i * (sw + sgap)
                    # Phase pill
                    ppill = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, top_y + Inches(0.18), sw, Inches(0.45))
                    fill_shape(ppill, palette["accent"])
                    ptf = ppill.text_frame
                    pp = ptf.paragraphs[0]
                    pp.text = st.get("phase", f"STEP {i+1}").upper()
                    pp.font.bold = True
                    pp.font.size = Pt(11)
                    pp.font.color.rgb = RGBColor(255, 255, 255)
                    pp.alignment = PP_ALIGN.CENTER

                    # Milestone Card
                    scard = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, top_y + Inches(0.85), sw, Inches(3.2))
                    fill_shape(scard, palette["light_card"], palette["light_card_border"], 1)

                    s_box = slide.shapes.add_textbox(x + Inches(0.2), top_y + Inches(1.0), sw - Inches(0.4), Inches(2.8))
                    stf = s_box.text_frame
                    stf.word_wrap = True

                    sp1 = stf.paragraphs[0]
                    sp1.text = st.get("title", f"Milestone {i+1}")
                    sp1.font.bold = True
                    sp1.font.size = Pt(17)
                    sp1.font.name = "Segoe UI"
                    sp1.font.color.rgb = RGBColor(*palette["light_title"])

                    sp2 = stf.add_paragraph()
                    sp2.text = st.get("desc", "")
                    sp2.font.size = Pt(13)
                    sp2.font.name = "Segoe UI"
                    sp2.font.color.rgb = RGBColor(*palette["light_body"])
                    sp2.space_before = Pt(8)

            # ── 6. Process Flowchart Pipeline Layout (Vector Arrows) ──
            elif layout_type in ("flowchart", "process_flow"):
                add_header(slide, s_title, s_subtitle, s_category)
                steps = s.get("steps") or [
                    {"num": "01", "name": "Intake & Ingestion", "desc": "Multimodal sensor and doc stream parsing", "out": "Normalized Context"},
                    {"num": "02", "name": "Cognitive Synthesis", "desc": "Autonomous reasoning and plan formation", "out": "Action Plan"},
                    {"num": "03", "name": "Tool Execution", "desc": "Native desktop API and pipeline actions", "out": "Executed Tasks"},
                    {"num": "04", "name": "Verification & Scale", "desc": "Telemetry logging and user validation", "out": "Closed Loop"}
                ]
                n_steps = min(len(steps), 4)
                card_w = Inches(2.25)
                gap = Inches(0.7)
                start_x = Inches(1.0)
                top_y = Inches(2.55)

                for i, st in enumerate(steps[:n_steps]):
                    x = start_x + i * (card_w + gap)
                    # Stage card
                    card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, top_y, card_w, Inches(3.45))
                    fill_shape(card, palette["light_card"], palette["light_card_border"], 1.2)

                    # Step badge
                    pill = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x + Inches(0.18), top_y + Inches(0.18), Inches(0.75), Inches(0.35))
                    fill_shape(pill, palette["accent_light"])
                    ptf = pill.text_frame
                    pp = ptf.paragraphs[0]
                    pp.text = st.get("num", f"0{i+1}")
                    pp.font.bold = True
                    pp.font.size = Pt(11)
                    pp.font.name = "Segoe UI"
                    pp.font.color.rgb = RGBColor(*palette["accent"])
                    pp.alignment = PP_ALIGN.CENTER

                    # Stage title & description
                    tb = slide.shapes.add_textbox(x + Inches(0.12), top_y + Inches(0.6), card_w - Inches(0.24), Inches(2.1))
                    tf = tb.text_frame
                    tf.word_wrap = True
                    p1 = tf.paragraphs[0]
                    p1.text = st.get("name", st.get("title", f"Step {i+1}"))
                    p1.font.bold = True
                    p1.font.size = Pt(15)
                    p1.font.name = "Segoe UI"
                    p1.font.color.rgb = RGBColor(*palette["light_title"])

                    p2 = tf.add_paragraph()
                    p2.text = st.get("desc", "")
                    p2.font.size = Pt(12)
                    p2.font.name = "Segoe UI"
                    p2.font.color.rgb = RGBColor(*palette["light_body"])
                    p2.space_before = Pt(8)

                    # Deliverable pill at bottom
                    out_text = st.get("out") or st.get("deliverable") or "Output"
                    out_pill = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x + Inches(0.12), top_y + Inches(2.85), card_w - Inches(0.24), Inches(0.42))
                    fill_shape(out_pill, palette["accent_light"], palette["accent"], 0.8)
                    optf = out_pill.text_frame
                    opp = optf.paragraphs[0]
                    opp.text = f"→ {out_text}"
                    opp.font.bold = True
                    opp.font.size = Pt(10)
                    opp.font.name = "Segoe UI"
                    opp.font.color.rgb = RGBColor(*palette["accent"])
                    opp.alignment = PP_ALIGN.CENTER

                    # Vector RIGHT_ARROW connecting to next step
                    if i < n_steps - 1:
                        arrow_x = x + card_w + Inches(0.12)
                        arrow_y = top_y + Inches(1.4)
                        arrow = slide.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, arrow_x, arrow_y, Inches(0.46), Inches(0.35))
                        fill_shape(arrow, palette["accent"])

                # Bottom takeaway banner
                b_banner = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.0), Inches(6.15), Inches(11.333), Inches(0.72))
                fill_shape(b_banner, palette["accent_light"], palette["accent"], 1)
                btf = b_banner.text_frame
                btf.word_wrap = True
                bp = btf.paragraphs[0]
                bp.text = s.get("takeaway") or "Operational Standard: Fully automated workflow pipeline with continuous validation checkpoints."
                bp.font.bold = True
                bp.font.size = Pt(13)
                bp.font.name = "Segoe UI"
                bp.font.color.rgb = RGBColor(*palette["light_title"])
                bp.alignment = PP_ALIGN.CENTER

            # ── 7. Multi-Tier System Architecture Layout ──
            elif layout_type in ("architecture", "system_diagram"):
                add_header(slide, s_title, s_subtitle, s_category)
                tiers = s.get("tiers") or [
                    {
                        "title": "TIER 1: CLIENT & INTERACTION LAYER",
                        "modules": ["Desktop Shell Application", "Voice/WebRTC Streams", "Canvas UI", "API SDK"]
                    },
                    {
                        "title": "TIER 2: INTELLIGENCE & ORCHESTRATION CORE",
                        "modules": ["Multimodal LLM Core", "Autonomous Tool Router", "Context Memory Store", "Guardrails Engine"]
                    },
                    {
                        "title": "TIER 3: DATA & INFRASTRUCTURE FOUNDATION",
                        "modules": ["Vector Semantic Index", "Local Encrypted Database", "Cloud Storage Connectors", "Audit & Telemetry Vault"]
                    }
                ]
                tier_w = Inches(11.333)
                tier_h = Inches(1.15)
                gap_y = Inches(0.38)
                start_y = Inches(2.2)

                for i, tr in enumerate(tiers[:3]):
                    y = start_y + i * (tier_h + gap_y)
                    t_card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.0), y, tier_w, tier_h)
                    fill_shape(t_card, palette["light_card"], palette["light_card_border"], 1)

                    # Tier badge
                    t_box = slide.shapes.add_textbox(Inches(1.2), y + Inches(0.06), Inches(6.0), Inches(0.35))
                    ttf = t_box.text_frame
                    tp = ttf.paragraphs[0]
                    tp.text = tr.get("title", f"TIER {i+1}").upper()
                    tp.font.bold = True
                    tp.font.size = Pt(11)
                    tp.font.name = "Segoe UI"
                    tp.font.color.rgb = RGBColor(*palette["accent"])

                    # Submodules inside tier
                    mods = tr.get("modules") or ["Component 1", "Component 2", "Component 3", "Component 4"]
                    mod_count = min(len(mods), 4)
                    mod_w = (tier_w - Inches(0.6) - Inches(0.2) * (mod_count - 1)) / mod_count
                    mod_x_start = Inches(1.3)
                    for mi, mod in enumerate(mods[:mod_count]):
                        mx = mod_x_start + mi * (mod_w + Inches(0.2))
                        m_card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, mx, y + Inches(0.42), mod_w, Inches(0.6))
                        fill_shape(m_card, palette["accent_light"], palette["accent"], 0.8)
                        mtf = m_card.text_frame
                        mtf.word_wrap = True
                        mp = mtf.paragraphs[0]
                        mp.text = str(mod)
                        mp.font.bold = True
                        mp.font.size = Pt(11)
                        mp.font.name = "Segoe UI"
                        mp.font.color.rgb = RGBColor(*palette["light_title"])
                        mp.alignment = PP_ALIGN.CENTER

                    # Down connector arrow between tiers
                    if i < len(tiers[:3]) - 1:
                        d_arrow = slide.shapes.add_shape(MSO_SHAPE.DOWN_ARROW, Inches(6.5), y + tier_h + Inches(0.05), Inches(0.35), Inches(0.26))
                        fill_shape(d_arrow, palette["accent"])

            # ── 8. Image Split Layout (Web Graphic + Strategic Takeaways) ──
            elif layout_type in ("image_split", "image_feature", "visual_spotlight"):
                add_header(slide, s_title, s_subtitle, s_category)
                img_query = s.get("image_query") or s_title or topic
                img_path = s.get("image_path")
                if not img_path:
                    img_path = fetch_presentation_image(img_query, topic=topic)

                left_x = Inches(1.0)
                top_y = Inches(2.4)
                img_w = Inches(5.4)
                img_h = Inches(4.3)

                img_card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left_x, top_y, img_w, img_h)
                fill_shape(img_card, palette["light_card"], palette["light_card_border"], 1)

                has_img = False
                if img_path and Path(img_path).exists():
                    try:
                        slide.shapes.add_picture(str(img_path), left_x + Inches(0.15), top_y + Inches(0.15), img_w - Inches(0.3), img_h - Inches(0.7))
                        has_img = True
                    except Exception as img_err:
                        print(f"[PowerPoint] Error placing image: {img_err}")

                if not has_img:
                    vec_center = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left_x + Inches(0.4), top_y + Inches(0.8), img_w - Inches(0.8), Inches(2.6))
                    fill_shape(vec_center, palette["accent_light"], palette["accent"], 1)
                    vtf = vec_center.text_frame
                    vtf.word_wrap = True
                    vp = vtf.paragraphs[0]
                    vp.text = "VISUAL SYSTEM WORKFLOW"
                    vp.font.bold = True
                    vp.font.size = Pt(14)
                    vp.font.color.rgb = RGBColor(*palette["accent"])
                    vp.alignment = PP_ALIGN.CENTER

                cap_text = s.get("image_caption") or f"Visual Representation: {img_query.title()}"
                cap_box = slide.shapes.add_textbox(left_x + Inches(0.2), top_y + img_h - Inches(0.5), img_w - Inches(0.4), Inches(0.4))
                ctf = cap_box.text_frame
                cp = ctf.paragraphs[0]
                cp.text = f"📷 {cap_text}"
                cp.font.bold = True
                cp.font.size = Pt(10)
                cp.font.color.rgb = RGBColor(*palette["accent"])

                right_x = Inches(6.8)
                r_card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, right_x, top_y, Inches(5.5), img_h)
                fill_shape(r_card, palette["light_card"], palette["light_card_border"], 1)

                r_box = slide.shapes.add_textbox(right_x + Inches(0.35), top_y + Inches(0.3), Inches(4.8), img_h - Inches(0.6))
                rtf = r_box.text_frame
                rtf.word_wrap = True
                rp1 = rtf.paragraphs[0]
                rp1.text = s.get("highlight_title") or "Technical & Strategic Capabilities"
                rp1.font.bold = True
                rp1.font.size = Pt(20)
                rp1.font.color.rgb = RGBColor(*palette["light_title"])

                points = s.get("points") or [
                    "Direct visual clarity and cross-functional stakeholder alignment",
                    "Deterministic workflow pipeline eliminating manual friction",
                    "Sub-second response speed with robust local fallback resilience",
                    "Native Office and document compatibility requiring zero user retraining"
                ]
                for pt in points[:4]:
                    pp = rtf.add_paragraph()
                    pp.text = f"•  {pt.strip()}"
                    pp.font.size = Pt(15)
                    pp.font.name = "Segoe UI"
                    pp.font.color.rgb = RGBColor(*palette["light_body"])
                    pp.space_before = Pt(12)

            # ── 9. Decision Logic & Branching Flowchart Layout ──
            elif layout_type in ("decision_flow", "branching_flow"):
                add_header(slide, s_title, s_subtitle, s_category)
                start_x = Inches(1.0)
                top_y = Inches(2.55)

                # Input Event Card
                in_card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, start_x, top_y + Inches(0.8), Inches(2.4), Inches(2.2))
                fill_shape(in_card, palette["light_card"], palette["light_card_border"], 1)
                itf = in_card.text_frame
                itf.word_wrap = True
                ip1 = itf.paragraphs[0]
                ip1.text = "SIGNAL INGESTION"
                ip1.font.bold = True
                ip1.font.size = Pt(11)
                ip1.font.color.rgb = RGBColor(*palette["accent"])
                ip2 = itf.add_paragraph()
                ip2.text = s.get("input_node") or "Operational Request &\nMultimodal Signal Intake"
                ip2.font.bold = True
                ip2.font.size = Pt(14)
                ip2.font.color.rgb = RGBColor(*palette["light_title"])
                ip2.space_before = Pt(8)

                arr1 = slide.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, start_x + Inches(2.5), top_y + Inches(1.7), Inches(0.6), Inches(0.35))
                fill_shape(arr1, palette["accent"])

                # Decision Gate Diamond
                gate_card = slide.shapes.add_shape(MSO_SHAPE.DIAMOND, start_x + Inches(3.2), top_y + Inches(0.6), Inches(2.6), Inches(2.6))
                fill_shape(gate_card, palette["accent_light"], palette["accent"], 1.5)
                gtf = gate_card.text_frame
                gtf.word_wrap = True
                gp = gtf.paragraphs[0]
                gp.text = s.get("decision_rule") or "Policy & Safety\nValidation Gate"
                gp.font.bold = True
                gp.font.size = Pt(12)
                gp.font.color.rgb = RGBColor(*palette["light_title"])
                gp.alignment = PP_ALIGN.CENTER

                # Path A Arrow & Card
                arr_a = slide.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, start_x + Inches(5.9), top_y + Inches(0.8), Inches(0.6), Inches(0.32))
                fill_shape(arr_a, palette["accent"])

                ba_card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, start_x + Inches(6.6), top_y, Inches(4.7), Inches(1.7))
                fill_shape(ba_card, palette["light_card"], palette["accent"], 1.5)
                batf = ba_card.text_frame
                batf.word_wrap = True
                bap1 = batf.paragraphs[0]
                bap1.text = "PATH A: FAST-TRACK AUTOMATION (92% VOL)"
                bap1.font.bold = True
                bap1.font.size = Pt(11)
                bap1.font.color.rgb = RGBColor(*palette["accent"])
                bap2 = batf.add_paragraph()
                bap2.text = s.get("path_a") or "Direct automated processing and instant stakeholder dispatch."
                bap2.font.size = Pt(13)
                bap2.font.color.rgb = RGBColor(*palette["light_body"])
                bap2.space_before = Pt(6)

                # Path B Arrow & Card
                arr_b = slide.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, start_x + Inches(5.9), top_y + Inches(2.6), Inches(0.6), Inches(0.32))
                fill_shape(arr_b, palette["secondary"])

                bb_card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, start_x + Inches(6.6), top_y + Inches(2.1), Inches(4.7), Inches(1.7))
                fill_shape(bb_card, palette["light_card"], palette["light_card_border"], 1)
                bbtf = bb_card.text_frame
                bbtf.word_wrap = True
                bbp1 = bbtf.paragraphs[0]
                bbp1.text = "PATH B: HUMAN-IN-THE-LOOP SUPERVISION"
                bbp1.font.bold = True
                bbp1.font.size = Pt(11)
                bbp1.font.color.rgb = RGBColor(*palette["secondary"])
                bbp2 = bbtf.add_paragraph()
                bbp2.text = s.get("path_b") or "Automated escalation to specialist operator with context audit trail."
                bbp2.font.size = Pt(13)
                bbp2.font.color.rgb = RGBColor(*palette["light_body"])
                bbp2.space_before = Pt(6)

            # ── 10. Visionary Quote Layout ──
            elif layout_type == "quote":
                add_header(slide, s_title, s_subtitle, s_category)
                q_card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.5), Inches(2.6), Inches(10.333), Inches(4.2))
                fill_shape(q_card, palette["light_card"], palette["accent"], 1.5)

                q_box = slide.shapes.add_textbox(Inches(2.0), Inches(3.0), Inches(9.333), Inches(2.6))
                q_tf = q_box.text_frame
                q_tf.word_wrap = True

                qp = q_tf.paragraphs[0]
                qp.text = f'“{s.get("quote", "Simplicity is the ultimate sophistication.")}”'
                qp.font.italic = True
                qp.font.size = Pt(26)
                qp.font.name = "Segoe UI"
                qp.font.color.rgb = RGBColor(*palette["light_title"])
                qp.alignment = PP_ALIGN.CENTER

                author_p = q_tf.add_paragraph()
                author_p.text = f'— {s.get("attribution", "AKARI-Slides Strategic Core")}'
                author_p.font.bold = True
                author_p.font.size = Pt(16)
                author_p.font.name = "Segoe UI"
                author_p.font.color.rgb = RGBColor(*palette["accent"])
                author_p.space_before = Pt(22)
                author_p.alignment = PP_ALIGN.CENTER

            # ── 7. Closing Slide (Dark Mode) ──
            elif layout_type == "closing":
                set_bg(slide, palette["dark_bg"])
                c_hero = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.0), Inches(1.2), Inches(11.333), Inches(5.1))
                fill_shape(c_hero, palette["dark_card"], palette["accent"], 1.5)

                add_category_badge(slide, "STRATEGIC NEXT STEPS", top_in=1.8, left_in=1.6, is_dark=True)

                cl_box = slide.shapes.add_textbox(Inches(1.6), Inches(2.4), Inches(10.0), Inches(1.2))
                ctf = cl_box.text_frame
                ctf.word_wrap = True
                cp1 = ctf.paragraphs[0]
                cp1.text = s_title
                cp1.font.bold = True
                cp1.font.size = Pt(36)
                cp1.font.name = "Segoe UI"
                cp1.font.color.rgb = RGBColor(*palette["dark_title"])

                # Action Items Box
                acts = s.get("takeaways") or [
                    "Review strategic timeline and team allocation",
                    "Establish steering committee and success metrics",
                    "Commence deployment sprint"
                ]
                act_box = slide.shapes.add_textbox(Inches(1.6), Inches(3.6), Inches(10.0), Inches(1.8))
                atf = act_box.text_frame
                atf.word_wrap = True

                for i, act in enumerate(acts):
                    ap = atf.paragraphs[0] if i == 0 else atf.add_paragraph()
                    ap.text = f"✓  {act.strip()}"
                    ap.font.size = Pt(17)
                    ap.font.name = "Segoe UI"
                    ap.font.color.rgb = RGBColor(*palette["dark_body"])
                    ap.space_before = Pt(8)

                # Q&A banner
                qa_text = s.get("qa_text") or "Open floor for Q&A and next steps."
                qa_box = slide.shapes.add_textbox(Inches(1.6), Inches(5.4), Inches(10.0), Inches(0.5))
                qaf = qa_box.text_frame
                qap = qaf.paragraphs[0]
                qap.text = f"•  {qa_text}"
                qap.font.bold = True
                qap.font.size = Pt(14)
                qap.font.name = "Segoe UI"
                qap.font.color.rgb = RGBColor(*palette["accent"])

            # ── 8. Standard High-Fidelity Content Slide (Default) ──
            else:
                add_header(slide, s_title, s_subtitle, s_category)
                points = s.get("points") or ["Core principle and operational advantage", "Accelerated delivery with precision", "Scalable workflow integration"]
                highlight_title = s.get("highlight_title") or "Key Directive"
                highlight_text = s.get("highlight_text") or "Focused execution aligned with stakeholder priorities."

                # Left highlight card (35% width)
                hl_card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.0), Inches(2.6), Inches(3.6), Inches(4.3))
                fill_shape(hl_card, palette["accent_light"], palette["accent"], 1)

                hl_box = slide.shapes.add_textbox(Inches(1.2), Inches(2.9), Inches(3.2), Inches(3.6))
                hl_tf = hl_box.text_frame
                hl_tf.word_wrap = True
                hl_p1 = hl_tf.paragraphs[0]
                hl_p1.text = highlight_title
                hl_p1.font.bold = True
                hl_p1.font.size = Pt(20)
                hl_p1.font.name = "Segoe UI"
                hl_p1.font.color.rgb = RGBColor(*palette["light_title"])

                hl_p2 = hl_tf.add_paragraph()
                hl_p2.text = highlight_text
                hl_p2.font.size = Pt(14)
                hl_p2.font.name = "Segoe UI"
                hl_p2.font.color.rgb = RGBColor(*palette["light_body"])
                hl_p2.space_before = Pt(12)

                # Right content card (60% width)
                c_card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(4.9), Inches(2.6), Inches(7.4), Inches(4.3))
                fill_shape(c_card, palette["light_card"], palette["light_card_border"], 1)

                c_box = slide.shapes.add_textbox(Inches(5.2), Inches(2.9), Inches(6.8), Inches(3.6))
                c_tf = c_box.text_frame
                c_tf.word_wrap = True

                for i, pt in enumerate(points[:5]):  # Max 5 short lines
                    cp = c_tf.paragraphs[0] if i == 0 else c_tf.add_paragraph()
                    cp.text = f"•  {pt.strip()}"
                    cp.font.size = Pt(16)
                    cp.font.name = "Segoe UI"
                    cp.font.color.rgb = RGBColor(*palette["light_title"])
                    cp.space_before = Pt(12)

            attach_notes(slide, notes_str)

        prs.save(str(out_path))
        slide_count = len(prs.slides)
    except Exception as e:
        print(f"[PowerPoint] python-pptx generation error: {e}, using pure OpenXML fallback")
        slide_count = _create_pptx_pure(out_path, title, subtitle, deck_slides, palette)
        used_engine = "pure_openxml (Lightweight Fallback Engine)"

    opened = False
    if open_after:
        opened = _open_file_in_os(out_path)

    engine_summary = f"Engine: {used_engine} - Generated {slide_count} slides with '{palette['name']}' 60-30-10 palette and native editable vector cards."

    return {
        "result": f"Successfully created presentation '{out_path.name}' with {slide_count} professional designer slides.",
        "path": str(out_path),
        "slides_count": slide_count,
        "theme": palette["name"],
        "opened": opened,
        "engine": used_engine,
        "engine_summary": engine_summary,
    }


def _create_pptx_pure(out_file: Path, title: str, subtitle: str, slides: List[Dict[str, Any]], palette: Dict[str, Any]) -> int:
    """Pure Python OpenXML fallback when python-pptx is unavailable."""
    import zipfile
    from xml.sax.saxutils import escape

    bg_hex = f"{palette.get('dark_bg', (15, 17, 26))[0]:02X}{palette.get('dark_bg', (15, 17, 26))[1]:02X}{palette.get('dark_bg', (15, 17, 26))[2]:02X}"
    title_hex = "FFFFFF"
    accent_hex = f"{palette.get('accent', (14, 165, 233))[0]:02X}{palette.get('accent', (14, 165, 233))[1]:02X}{palette.get('accent', (14, 165, 233))[2]:02X}"
    card_hex = f"{palette.get('dark_card', (30, 41, 59))[0]:02X}{palette.get('dark_card', (30, 41, 59))[1]:02X}{palette.get('dark_card', (30, 41, 59))[2]:02X}"

    all_slides = [{"type": "title", "title": title, "subtitle": subtitle}]
    for s in slides:
        all_slides.append(s)

    num_slides = len(all_slides)
    content_types = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
        '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
        '  <Default Extension="xml" ContentType="application/xml"/>',
        '  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>',
        '  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>',
        '  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>',
        '  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>',
    ]
    for i in range(1, num_slides + 1):
        content_types.append(f'  <Override PartName="/ppt/slides/slide{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>')
    content_types.append('</Types>')

    root_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>'''

    pres_rels = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>',
        '  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>',
    ]
    for i in range(1, num_slides + 1):
        pres_rels.append(f'  <Relationship Id="rId{i+2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide{i}.xml"/>')
    pres_rels.append('</Relationships>')

    pres_xml = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">',
        '  <p:sldMasterIdLst>',
        '    <p:sldMasterId id="2147483648" r:id="rId1"/>',
        '  </p:sldMasterIdLst>',
        '  <p:sldIdLst>',
    ]
    for i in range(1, num_slides + 1):
        pres_xml.append(f'    <p:sldId id="{255+i}" r:id="rId{i+2}"/>')
    pres_xml.append('  </p:sldIdLst>')
    pres_xml.append('  <p:sldSz cx="12192000" cy="6858000" type="custom"/>')
    pres_xml.append('  <p:notesSz cx="6858000" cy="9144000"/>')
    pres_xml.append('</p:presentation>')

    theme_xml = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Akari Modern">
  <a:themeElements>
    <a:clrScheme name="Akari">
      <a:dk1><a:srgbClr val="{bg_hex}"/></a:dk1>
      <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="{card_hex}"/></a:dk2>
      <a:lt2><a:srgbClr val="F1F5F9"/></a:lt2>
      <a:accent1><a:srgbClr val="{accent_hex}"/></a:accent1>
      <a:accent2><a:srgbClr val="{title_hex}"/></a:accent2>
      <a:accent3><a:srgbClr val="94A3B8"/></a:accent3>
      <a:accent4><a:srgbClr val="38BDF8"/></a:accent4>
      <a:accent5><a:srgbClr val="A855F7"/></a:accent5>
      <a:accent6><a:srgbClr val="EC4899"/></a:accent6>
      <a:hlink><a:srgbClr val="{accent_hex}"/></a:hlink>
      <a:folHlink><a:srgbClr val="94A3B8"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="AkariFont">
      <a:majorFont><a:latin typeface="Segoe UI"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
      <a:minorFont><a:latin typeface="Segoe UI"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
    </a:fontScheme>
  </a:themeElements>
</a:theme>'''

    master_xml = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:bg><p:bgPr><a:solidFill><a:srgbClr val="{bg_hex}"/></a:solidFill></p:bgPr></p:bg>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>'''

    master_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>'''

    layout_xml = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
  <p:cSld name="Blank">
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>'''

    layout_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>'''

    slide_xml_list = []
    slide_rels_list = []

    for i, s in enumerate(all_slides, 1):
        s_title = escape(str(s.get("title", f"Slide {i}")))
        s_sub = escape(str(s.get("subtitle", "")))
        s_points = s.get("points", [])

        pts_xml = ""
        for pt in s_points:
            safe_pt = escape(str(pt))
            pts_xml += f'<a:p><a:r><a:rPr lang="en-US" sz="1600"><a:solidFill><a:srgbClr val="F1F5F9"/></a:solidFill></a:rPr><a:t>•  {safe_pt}</a:t></a:r></a:p>'

        slide_xml = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="1000000" y="800000"/><a:ext cx="10192000" cy="1000000"/></a:xfrm></p:spPr>
        <p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en-US" b="1" sz="3200"><a:solidFill><a:srgbClr val="{title_hex}"/></a:solidFill></a:rPr><a:t>{s_title}</a:t></a:r></a:p></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Content"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="1000000" y="2000000"/><a:ext cx="10192000" cy="4200000"/></a:xfrm></p:spPr>
        <p:txBody><a:bodyPr/>{pts_xml}</p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>'''
        slide_xml_list.append(slide_xml)
        slide_rels_list.append('''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>''')

    out_file.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(str(out_file), 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', "\n".join(content_types))
        z.writestr('_rels/.rels', root_rels)
        z.writestr('ppt/presentation.xml', "\n".join(pres_xml))
        z.writestr('ppt/_rels/presentation.xml.rels', "\n".join(pres_rels))
        z.writestr('ppt/theme/theme1.xml', theme_xml)
        z.writestr('ppt/slideMasters/slideMaster1.xml', master_xml)
        z.writestr('ppt/slideMasters/_rels/slideMaster1.xml.rels', master_rels)
        z.writestr('ppt/slideLayouts/slideLayout1.xml', layout_xml)
        z.writestr('ppt/slideLayouts/_rels/slideLayout1.xml.rels', layout_rels)
        for i, (s_xml, s_rel) in enumerate(zip(slide_xml_list, slide_rels_list), 1):
            z.writestr(f'ppt/slides/slide{i}.xml', s_xml)
            z.writestr(f'ppt/slides/_rels/slide{i}.xml.rels', s_rel)

    return num_slides


@register("openPowerPoint")
def open_powerpoint(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Launch Microsoft PowerPoint or open a specific presentation file (.pptx).
    Intelligently searches Desktop, Downloads, Documents, and project folders.
    """
    file_path: Optional[str] = args.get("file_path") or args.get("path") or args.get("filename") or args.get("name")
    search_folders = [
        HOME / "Desktop",
        HOME / "Downloads",
        HOME / "Documents",
        Path.cwd(),
        HOME,
    ]

    target_file: Optional[Path] = None

    if file_path and file_path.strip():
        query = file_path.strip()
        p = Path(os.path.expanduser(query))

        if p.is_absolute() and p.exists():
            target_file = p
        else:
            clean_query = query.lower().replace(".pptx", "").replace(".ppt", "")
            for folder in search_folders:
                if not folder.exists():
                    continue
                for candidate in folder.glob("*.ppt*"):
                    cand_stem = candidate.stem.lower()
                    if cand_stem == clean_query or candidate.name.lower() == query.lower():
                        target_file = candidate
                        break
                if target_file:
                    break

            if not target_file:
                for folder in search_folders:
                    if not folder.exists():
                        continue
                    for candidate in folder.glob("*.ppt*"):
                        if clean_query in candidate.stem.lower() or clean_query in candidate.name.lower():
                            target_file = candidate
                            break
                    if target_file:
                        break

    if not target_file:
        all_ppts: List[Path] = []
        for folder in search_folders:
            if folder.exists():
                try:
                    for f in list(folder.glob("*.pptx")) + list(folder.glob("*.ppt")):
                        if not f.name.startswith("~$") and not f.name.startswith(".~") and f.is_file():
                            all_ppts.append(f)
                except Exception:
                    pass
        if all_ppts:
            all_ppts.sort(key=lambda f: f.stat().st_mtime, reverse=True)
            target_file = all_ppts[0]

    if target_file and target_file.exists():
        opened = _open_file_in_os(target_file)
        return {
            "result": f"Opened presentation '{target_file.name}' from {target_file.parent}.",
            "path": str(target_file),
            "file_name": target_file.name,
            "success": opened,
        }

    try:
        if platform.system() == "Windows":
            subprocess.Popen(["start", "powerpnt"], shell=True)
            return {"result": "Launched Microsoft PowerPoint."}
        else:
            subprocess.Popen(["libreoffice", "--impress"])
            return {"result": "Launched LibreOffice Impress."}
    except Exception as e:
        raise ToolError(f"Failed to launch PowerPoint: {e}")


@register("readPresentation")
def read_presentation(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Read and extract all text, slide titles, and bullet points from a .pptx file.
    """
    file_path: str = args.get("file_path") or args.get("path") or args.get("filename") or ""
    if not file_path:
        raise ToolError("Please specify a presentation file path or filename to read.")

    p = Path(os.path.expanduser(file_path))
    if not p.is_absolute():
        for folder in [HOME / "Desktop", HOME / "Documents", HOME / "Downloads", Path.cwd()]:
            candidate = folder / file_path
            if candidate.exists():
                p = candidate
                break
            candidate_pptx = folder / f"{file_path}.pptx"
            if candidate_pptx.exists():
                p = candidate_pptx
                break

    if not p.exists():
        raise ToolError(f"Presentation file '{file_path}' not found.")

    try:
        from pptx import Presentation
        prs = Presentation(str(p))
        slides_data = []

        for idx, slide in enumerate(prs.slides, 1):
            slide_title = ""
            texts = []

            for shape in slide.shapes:
                if shape.has_text_frame:
                    t_text = shape.text_frame.text.strip()
                    if t_text:
                        if not slide_title and shape == slide.shapes[0]:
                            slide_title = t_text
                        texts.append(t_text)

            notes = ""
            try:
                if slide.has_notes_slide and slide.notes_slide.notes_text_frame:
                    notes = slide.notes_slide.notes_text_frame.text.strip()
            except Exception:
                pass

            slides_data.append({
                "slide_number": idx,
                "title": slide_title or f"Slide {idx}",
                "content": texts,
                "speaker_notes": notes,
            })

        return {
            "file_name": p.name,
            "path": str(p),
            "total_slides": len(slides_data),
            "slides": slides_data,
        }
    except Exception:
        import zipfile
        import xml.etree.ElementTree as ET

        slides_data = []
        try:
            with zipfile.ZipFile(str(p), "r") as z:
                slide_names = sorted(
                    [n for n in z.namelist() if re.match(r"^ppt/slides/slide\d+\.xml$", n)],
                    key=lambda x: int(re.search(r"\d+", x).group())
                )
                for idx, sname in enumerate(slide_names, 1):
                    xml_data = z.read(sname)
                    root = ET.fromstring(xml_data)
                    texts = []
                    for elem in root.iter("{http://schemas.openxmlformats.org/drawingml/2006/main}t"):
                        if elem.text and elem.text.strip():
                            texts.append(elem.text.strip())
                    title = texts[0] if texts else f"Slide {idx}"
                    slides_data.append({
                        "slide_number": idx,
                        "title": title,
                        "content": texts,
                    })

            return {
                "file_name": p.name,
                "path": str(p),
                "total_slides": len(slides_data),
                "slides": slides_data,
            }
        except Exception as fallback_err:
            raise ToolError(f"Could not read presentation '{p.name}': {fallback_err}")


@register("addSlideToPresentation")
def add_slide_to_presentation(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Append one or more slides to an existing .pptx file.
    """
    file_path: str = args.get("file_path") or args.get("path") or ""
    slide_title: str = args.get("title") or "New Slide"
    points_raw: Any = args.get("points") or args.get("content") or []

    if isinstance(points_raw, str):
        points = [p.strip() for p in points_raw.split("\n") if p.strip()]
    else:
        points = list(points_raw)

    if not file_path:
        raise ToolError("Please specify file_path of the presentation to modify.")

    p = Path(os.path.expanduser(file_path))
    if not p.is_absolute():
        for folder in [HOME / "Desktop", HOME / "Documents", HOME / "Downloads", Path.cwd()]:
            candidate = folder / file_path
            if candidate.exists():
                p = candidate
                break

    if not p.exists():
        raise ToolError(f"File not found: {file_path}")

    from pptx import Presentation
    from pptx.util import Inches, Pt
    from pptx.dml.color import RGBColor
    from pptx.enum.shapes import MSO_SHAPE

    prs = Presentation(str(p))
    blank_layout = prs.slide_layouts[6]
    slide = prs.slides.add_slide(blank_layout)

    # Clean background
    bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height)
    bg.fill.solid()
    bg.fill.fore_color.rgb = RGBColor(248, 250, 252)
    bg.line.fill.background()

    # Title
    t_box = slide.shapes.add_textbox(Inches(1.0), Inches(0.8), Inches(11.0), Inches(1.0))
    tf = t_box.text_frame
    p_title = tf.paragraphs[0]
    p_title.text = slide_title
    p_title.font.bold = True
    p_title.font.size = Pt(28)
    p_title.font.name = "Segoe UI"
    p_title.font.color.rgb = RGBColor(15, 23, 42)

    # Card
    card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.0), Inches(2.0), Inches(11.3), Inches(4.8))
    card.fill.solid()
    card.fill.fore_color.rgb = RGBColor(255, 255, 255)
    card.line.color.rgb = RGBColor(226, 232, 240)
    card.line.width = Pt(1)

    c_box = slide.shapes.add_textbox(Inches(1.3), Inches(2.3), Inches(10.7), Inches(4.2))
    cf = c_box.text_frame
    cf.word_wrap = True

    for i, pt in enumerate(points):
        cp = cf.paragraphs[0] if i == 0 else cf.add_paragraph()
        cp.text = f"•  {pt.strip()}"
        cp.font.size = Pt(16)
        cp.font.name = "Segoe UI"
        cp.font.color.rgb = RGBColor(51, 65, 85)
        cp.space_before = Pt(12)

    prs.save(str(p))
    total_slides = len(prs.slides)

    return {
        "result": f"Added slide '{slide_title}' to '{p.name}'. Total slides: {total_slides}",
        "path": str(p),
        "total_slides": total_slides,
    }


__all__ = [
    "create_presentation",
    "open_powerpoint",
    "read_presentation",
    "add_slide_to_presentation",
    "THEME_PALETTES",
]
