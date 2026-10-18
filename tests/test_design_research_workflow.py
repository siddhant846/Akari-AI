"""
End-to-End Test for AKARI Design Research, Pick the Best, Style Brief,
Animation Kit Build, Quality Check & Style Library Storage.
"""

import json
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from agent.tools.files import get_workspace_dir
from agent.tools.reference_designer import (
    research_design_references,
    quality_check_website,
)
from agent.tools.website_builder import build_animated_website


def test_research_and_scoring():
    print("[1] Testing Research & 1-5 Scoring...")
    res = research_design_references({
        "name": "Velox Cloud OS",
        "category": "saas",
        "description": "High-performance distributed edge platform for mission-critical apps",
    })

    assert res["status"] == "brief_ready"
    assert "winning_reference" in res
    assert "Nexus AI" in res["winning_reference"]
    assert res["score"] >= 20

    # Verify 5-8 lines summary
    summary_lines = res["summary"].strip().split("\n")
    print(f"Summary line count: {len(summary_lines)}")
    assert 5 <= len(summary_lines) <= 8, f"Expected 5-8 lines summary, got {len(summary_lines)}"

    # Verify MOTION PLAN in Style Brief
    brief = res["style_brief"]
    assert "motion_plan" in brief
    assert len(brief["motion_plan"]) >= 5
    print("[PASS] Research, 1-5 scoring, and 5-8 line summary verified.")


def test_style_library_saving_and_reuse():
    print("\n[2] Testing /style-library/ saving & reuse...")
    ws = get_workspace_dir()
    lib_file = ws / "style-library" / "saas" / "STYLE_BRIEF.json"
    assert lib_file.exists(), f"Style library brief not found at {lib_file}"

    # Re-run research to verify reuse
    res2 = research_design_references({
        "name": "Velox Cloud OS 2",
        "category": "saas",
    })
    assert res2.get("reused_from_cache") is True
    print("[PASS] Style library saving and reuse verified.")


def test_build_with_animation_kit():
    print("\n[3] Testing Build with Animation Kit Template (_template)...")
    res = build_animated_website({
        "name": "Velox Cloud OS",
        "category": "saas",
        "tagline": "Next-Generation Global Edge Compute",
        "open_in_browser": False,
    })

    ws = get_workspace_dir()
    html_file = ws / "velox-cloud-os" / "index.html"
    assert html_file.exists(), f"Website file not found at {html_file}"

    content = html_file.read_text(encoding="utf-8")
    assert "hero-section" in content
    assert "metric-number" in content
    assert "bento-card" in content
    assert "marquee-track" in content
    assert "tab-btn" in content
    assert "scroll-reveal" in content
    assert "modal-card" in content
    assert "floating-dock" in content

    # Check style-library snapshot
    snapshot = ws / "style-library" / "saas" / "last_build" / "index.html"
    assert snapshot.exists(), f"Snapshot not found in style-library: {snapshot}"
    print(f"[PASS] Build with 8 animated components saved to {html_file} and snapshot to {snapshot}")


def test_quality_check_and_screenshots():
    print("\n[4] Testing Quality Check & 5 Scroll/Hover Screenshots...")
    res = quality_check_website({"slug": "velox-cloud-os"})

    assert res["status"] == "verified"
    assert res["animated_components_count"] >= 5, f"Expected >= 5 animated components, got {res['animated_components_count']}"
    assert res["score"] >= 85

    ws = get_workspace_dir()
    screenshots_dir = ws / "velox-cloud-os" / "screenshots"
    report_file = ws / "velox-cloud-os" / "QUALITY_REPORT.md"

    assert report_file.exists(), f"QUALITY_REPORT.md missing at {report_file}"
    print(f"[PASS] Quality check verified: {res['animated_components_count']} animated components, Polish Score {res['score']}/100.")


if __name__ == "__main__":
    print("=== RUNNING FULL DESIGN RESEARCH & BUILD TESTS ===")
    test_research_and_scoring()
    test_style_library_saving_and_reuse()
    test_build_with_animation_kit()
    test_quality_check_and_screenshots()
    print("\n=== ALL DESIGN RESEARCH & BUILD TESTS PASSED! ===")
