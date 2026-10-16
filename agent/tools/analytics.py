"""
Data Analytics Tool for Akari AI.

Provides automated dataset exploration, statistical summaries, correlation analysis,
aggregations, and trend extraction for CSV, JSON, and TSV files. Works with 100% zero
external dependencies using Python standard library, with optional pandas integration.
"""

from __future__ import annotations

import csv
import json
import math
import os
import statistics
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

from ..registry import ToolError, register
from .files import _ensure_safe


def _load_data(file_path: str) -> Tuple[List[str], List[Dict[str, Any]]]:
    p = Path(os.path.expandvars(os.path.expanduser(str(file_path)))).resolve()
    _ensure_safe(p)
    if not p.exists():
        raise ToolError(f"Data file does not exist: {p}")
    if not p.is_file():
        raise ToolError(f"Target path is not a file: {p}")

    suffix = p.suffix.lower()
    headers: List[str] = []
    rows: List[Dict[str, Any]] = []

    if suffix in [".csv", ".txt"]:
        with open(p, "r", encoding="utf-8", errors="replace") as f:
            sample = f.read(2048)
            f.seek(0)
            delimiter = ","
            try:
                sniffer = csv.Sniffer()
                dialect = sniffer.sniff(sample)
                delimiter = dialect.delimiter
            except Exception:
                delimiter = "\t" if "\t" in sample and "," not in sample else ","
            
            reader = csv.DictReader(f, delimiter=delimiter)
            headers = [h.strip() for h in (reader.fieldnames or []) if h]
            for row in reader:
                rows.append({k.strip(): v.strip() if isinstance(v, str) else v for k, v in row.items() if k})

    elif suffix == ".tsv":
        with open(p, "r", encoding="utf-8", errors="replace") as f:
            reader = csv.DictReader(f, delimiter="\t")
            headers = [h.strip() for h in (reader.fieldnames or []) if h]
            for row in reader:
                rows.append({k.strip(): v.strip() if isinstance(v, str) else v for k, v in row.items() if k})

    elif suffix == ".json":
        with open(p, "r", encoding="utf-8", errors="replace") as f:
            raw = json.load(f)
            if isinstance(raw, list) and len(raw) > 0 and isinstance(raw[0], dict):
                headers = list(raw[0].keys())
                rows = raw
            elif isinstance(raw, dict):
                # Check for table-like records
                for key, val in raw.items():
                    if isinstance(val, list) and len(val) > 0 and isinstance(val[0], dict):
                        headers = list(val[0].keys())
                        rows = val
                        break
                if not rows:
                    headers = ["key", "value"]
                    rows = [{"key": k, "value": v} for k, v in raw.items()]
            else:
                raise ToolError("JSON data must be a list of objects or a key-value record.")
    else:
        raise ToolError(f"Unsupported data format '{suffix}'. Supported formats: .csv, .tsv, .json")

    return headers, rows


def _try_parse_num(val: Any) -> Optional[float]:
    if val is None:
        return None
    s = str(val).strip().replace("$", "").replace(",", "").replace("%", "")
    if not s:
        return None
    try:
        f = float(s)
        return f if not math.isnan(f) else None
    except ValueError:
        return None


@register("analyzeData")
def analyze_data(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Perform deep statistical analysis on a dataset (CSV, JSON, TSV).
    Returns shape, column data types, missing value counts, numerical summary
    statistics (mean, median, stdev, min, max, quartiles), top categorical frequencies,
    and automatic insights.
    """
    file_path = args.get("file_path") or args.get("path")
    if not file_path:
        raise ToolError("Parameter 'file_path' is required.")

    headers, rows = _load_data(str(file_path))
    total_rows = len(rows)
    total_cols = len(headers)

    if total_rows == 0:
        return {
            "result": f"Dataset at '{file_path}' is empty.",
            "total_rows": 0,
            "total_columns": total_cols,
            "columns": headers,
        }

    # Inspect each column
    column_stats: Dict[str, Any] = {}
    numeric_columns: Dict[str, List[float]] = {}
    categorical_columns: Dict[str, List[str]] = {}

    for col in headers:
        values = [r.get(col) for r in rows]
        null_count = sum(1 for v in values if v is None or str(v).strip() == "" or str(v).lower() in ["nan", "null", "none", "na"])
        non_null_values = [v for v in values if v is not None and str(v).strip() != "" and str(v).lower() not in ["nan", "null", "none", "na"]]

        # Test if numeric
        numeric_vals = [_try_parse_num(v) for v in non_null_values]
        valid_nums = [v for v in numeric_vals if v is not None]

        is_numeric = len(valid_nums) > 0 and (len(valid_nums) / max(1, len(non_null_values))) >= 0.75

        if is_numeric and valid_nums:
            numeric_columns[col] = valid_nums
            sorted_nums = sorted(valid_nums)
            n = len(sorted_nums)
            mean_val = statistics.mean(sorted_nums)
            median_val = statistics.median(sorted_nums)
            stdev_val = statistics.stdev(sorted_nums) if n > 1 else 0.0
            min_val = sorted_nums[0]
            max_val = sorted_nums[-1]
            q25 = sorted_nums[int(n * 0.25)] if n >= 4 else min_val
            q75 = sorted_nums[int(n * 0.75)] if n >= 4 else max_val

            column_stats[col] = {
                "type": "numeric",
                "count": len(valid_nums),
                "null_count": null_count,
                "null_pct": round((null_count / max(1, total_rows)) * 100, 2),
                "mean": round(mean_val, 4),
                "median": round(median_val, 4),
                "stdev": round(stdev_val, 4),
                "min": round(min_val, 4),
                "max": round(max_val, 4),
                "q25": round(q25, 4),
                "q75": round(q75, 4),
            }
        else:
            str_vals = [str(v).strip() for v in non_null_values]
            categorical_columns[col] = str_vals
            # Frequencies
            freqs: Dict[str, int] = {}
            for v in str_vals:
                freqs[v] = freqs.get(v, 0) + 1
            top_values = sorted(freqs.items(), key=lambda x: x[1], reverse=True)[:5]

            column_stats[col] = {
                "type": "categorical",
                "count": len(str_vals),
                "null_count": null_count,
                "null_pct": round((null_count / max(1, total_rows)) * 100, 2),
                "unique_count": len(freqs),
                "top_values": [{"value": val, "frequency": count} for val, count in top_values],
            }

    # Calculate Pearson correlations for numeric columns
    correlations: List[Dict[str, Any]] = []
    num_cols = list(numeric_columns.keys())
    if len(num_cols) >= 2:
        for i in range(len(num_cols)):
            for j in range(i + 1, len(num_cols)):
                col_a = num_cols[i]
                col_b = num_cols[j]
                vals_a = numeric_columns[col_a]
                vals_b = numeric_columns[col_b]
                min_len = min(len(vals_a), len(vals_b))
                if min_len >= 5:
                    sub_a = vals_a[:min_len]
                    sub_b = vals_b[:min_len]
                    mean_a = statistics.mean(sub_a)
                    mean_b = statistics.mean(sub_b)
                    num = sum((a - mean_a) * (b - mean_b) for a, b in zip(sub_a, sub_b))
                    den_a = math.sqrt(sum((a - mean_a) ** 2 for a in sub_a))
                    den_b = math.sqrt(sum((b - mean_b) ** 2 for b in sub_b))
                    if den_a > 0 and den_b > 0:
                        r = num / (den_a * den_b)
                        if abs(r) >= 0.3:  # Only report noteworthy correlations
                            correlations.append({
                                "col_a": col_a,
                                "col_b": col_b,
                                "correlation": round(r, 3),
                                "strength": "strong" if abs(r) >= 0.7 else "moderate"
                            })

    # Key analytical takeaways
    insights: List[str] = [
        f"Dataset contains {total_rows:,} records across {total_cols} dimensions ({len(num_cols)} numeric, {total_cols - len(num_cols)} categorical)."
    ]
    for corr in sorted(correlations, key=lambda x: abs(x["correlation"]), reverse=True)[:3]:
        insights.append(
            f"Detected {corr['strength']} correlation ({corr['correlation']:+0.2f}) between '{corr['col_a']}' and '{corr['col_b']}'."
        )

    # Missing value warnings
    high_nulls = [c for c, s in column_stats.items() if s["null_pct"] > 10.0]
    if high_nulls:
        insights.append(f"Noticeable missing data detected in: {', '.join(high_nulls)}.")

    return {
        "result": f"Data analysis completed for '{os.path.basename(str(file_path))}'.",
        "dataset_name": os.path.basename(str(file_path)),
        "file_path": str(file_path),
        "total_rows": total_rows,
        "total_columns": total_cols,
        "numeric_column_count": len(num_cols),
        "categorical_column_count": total_cols - len(num_cols),
        "columns": column_stats,
        "correlations": correlations[:5],
        "insights": insights,
        "sample_preview": rows[:3],
    }


@register("createDataChart")
def create_data_chart(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate an analytical SVG chart (bar chart, line chart, scatter plot) from
    dataset metrics or numbers and save it as an SVG image on Desktop or workspace.
    """
    title = str(args.get("title") or "Data Analysis Chart")
    chart_type = str(args.get("chart_type") or "bar").lower()
    labels = args.get("labels") or []
    values = args.get("values") or []
    save_folder = args.get("save_folder") or "desktop"

    if not labels or not values or len(labels) != len(values):
        raise ToolError("Parameters 'labels' and 'values' are required and must have identical length.")

    parsed_values = [_try_parse_num(v) or 0.0 for v in values]
    max_val = max(parsed_values) if parsed_values else 1.0
    min_val = min(parsed_values) if parsed_values else 0.0
    val_range = max(1.0, max_val - min(0.0, min_val))

    # Determine save path
    desktop = Path(os.path.expanduser("~/Desktop"))
    if not desktop.exists():
        desktop = Path(os.getcwd())
    filename = f"{title.lower().replace(' ', '_')[:30]}_chart.svg"
    out_path = desktop / filename

    svg_width = 800
    svg_height = 450
    margin_top = 60
    margin_bottom = 60
    margin_left = 70
    margin_right = 40
    plot_width = svg_width - margin_left - margin_right
    plot_height = svg_height - margin_top - margin_bottom

    elements: List[str] = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {svg_width} {svg_height}" width="{svg_width}" height="{svg_height}" style="background:#0b0f19; font-family:sans-serif;">',
        f'<text x="{svg_width/2}" y="36" fill="#38bdf8" font-size="20" font-weight="bold" text-anchor="middle">{title}</text>',
        f'<line x1="{margin_left}" y1="{svg_height - margin_bottom}" x2="{svg_width - margin_right}" y2="{svg_height - margin_bottom}" stroke="#334155" stroke-width="2"/>',
        f'<line x1="{margin_left}" y1="{margin_top}" x2="{margin_left}" y2="{svg_height - margin_bottom}" stroke="#334155" stroke-width="2"/>',
    ]

    n = len(labels)
    if chart_type in ["bar", "column"]:
        bar_width = min(60.0, (plot_width / max(1, n)) * 0.65)
        step = plot_width / max(1, n)
        for i, (label, val) in enumerate(zip(labels, parsed_values)):
            x = margin_left + i * step + (step - bar_width) / 2
            bar_h = (max(0.0, val) / val_range) * plot_height
            y = (svg_height - margin_bottom) - bar_h
            elements.append(
                f'<rect x="{x:.1f}" y="{y:.1f}" width="{bar_width:.1f}" height="{bar_h:.1f}" rx="4" fill="url(#cyanGrad)" />'
            )
            elements.append(
                f'<text x="{x + bar_width/2:.1f}" y="{y - 8:.1f}" fill="#94a3b8" font-size="11" text-anchor="middle">{val}</text>'
            )
            elements.append(
                f'<text x="{x + bar_width/2:.1f}" y="{svg_height - margin_bottom + 18:.1f}" fill="#cbd5e1" font-size="11" text-anchor="middle">{str(label)[:12]}</text>'
            )
    else:
        # Line chart
        step = plot_width / max(1, n - 1) if n > 1 else plot_width / 2
        pts: List[str] = []
        for i, (label, val) in enumerate(zip(labels, parsed_values)):
            x = margin_left + i * step
            norm = (val - min_val) / val_range if val_range > 0 else 0.5
            y = (svg_height - margin_bottom) - norm * plot_height
            pts.append(f"{x:.1f},{y:.1f}")
            elements.append(
                f'<circle cx="{x:.1f}" cy="{y:.1f}" r="5" fill="#38bdf8" stroke="#0b0f19" stroke-width="2"/>'
            )
            elements.append(
                f'<text x="{x:.1f}" y="{y - 10:.1f}" fill="#94a3b8" font-size="11" text-anchor="middle">{val}</text>'
            )
            elements.append(
                f'<text x="{x:.1f}" y="{svg_height - margin_bottom + 18:.1f}" fill="#cbd5e1" font-size="11" text-anchor="middle">{str(label)[:12]}</text>'
            )

        polyline = " ".join(pts)
        elements.insert(4, f'<polyline points="{polyline}" fill="none" stroke="#06b6d4" stroke-width="3" stroke-linecap="round"/>')

    # Gradient definition
    elements.insert(1, '<defs><linearGradient id="cyanGrad" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#0284c7"/></linearGradient></defs>')
    elements.append("</svg>")

    svg_content = "\n".join(elements)
    out_path.write_text(svg_content, encoding="utf-8")

    # Auto-open if requested
    if args.get("open_after", True):
        try:
            os.startfile(str(out_path))
        except Exception:
            pass

    return {
        "result": f"Generated analytical chart '{title}' and saved to: {out_path}",
        "path": str(out_path),
        "chart_type": chart_type,
        "datapoints": len(labels)
    }
