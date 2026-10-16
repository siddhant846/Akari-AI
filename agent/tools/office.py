"""
Office & Productivity Suite automation: Excel spreadsheets (.xlsx) and Word documents (.docx).

Features:
  * createExcelSpreadsheet: Builds styled multi-column Excel workbooks with formulas and headers.
  * readExcelSpreadsheet: Reads and parses sheet data from .xlsx workbooks.
  * createDocument: Generates formatted Word (.docx) documents and reports.
  * openOfficeFile: Launches Microsoft Excel or Microsoft Word with the specified file.
"""

from __future__ import annotations

import os
import re
import sys
import platform
import subprocess
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional
from xml.sax.saxutils import escape

from ..registry import ToolError, register
from .files import HOME, FOLDER_ALIASES

DEFAULT_SAVE_DIR = HOME / "Desktop"


def _resolve_save_path(filename: str, folder: Optional[str], default_ext: str) -> Path:
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
    clean_name = filename.strip() if filename else f"Report{default_ext}"
    if not clean_name.lower().endswith(default_ext.lower()):
        clean_name += default_ext
    clean_name = re.sub(r'[\\/*?:"<>|]', "", clean_name)
    return target_dir / clean_name


def _open_file(path: Path) -> bool:
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
        print(f"[Office] Error opening file: {e}")
        return False


def _create_xlsx_pure(out_file: Path, sheet_name: str, headers: List[str], rows: List[List[Any]]) -> int:
    """Zero-dependency pure Python OpenXML .xlsx workbook generator."""
    out_file.parent.mkdir(parents=True, exist_ok=True)

    # 1. [Content_Types].xml
    content_types = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>'''

    # 2. _rels/.rels
    root_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>'''

    # 3. xl/_rels/workbook.xml.rels
    wb_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>'''

    # 4. xl/workbook.xml
    safe_sheet = escape(sheet_name or "Sheet1")
    wb_xml = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="{safe_sheet}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>'''

    # 5. xl/styles.xml (with bold header & number formatting)
    styles_xml = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Segoe UI"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Segoe UI"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1E293B"/></patternFill></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
  </cellXfs>
</styleSheet>'''

    # 6. xl/worksheets/sheet1.xml
    def col_letter(col_idx: int) -> str:
        res = ""
        while col_idx > 0:
            col_idx, rem = divmod(col_idx - 1, 26)
            res = chr(65 + rem) + res
        return res

    rows_xml = []
    # Header Row (Row 1)
    if headers:
        header_cells = []
        for c_idx, h in enumerate(headers, 1):
            ref = f"{col_letter(c_idx)}1"
            h_text = escape(str(h))
            header_cells.append(f'<c r="{ref}" t="inlineStr" s="1"><is><t>{h_text}</t></is></c>')
        rows_xml.append(f'<row r="1">{"".join(header_cells)}</row>')

    # Data Rows
    start_row = 2 if headers else 1
    for r_idx, row in enumerate(rows, start_row):
        cells_xml = []
        for c_idx, val in enumerate(row, 1):
            ref = f"{col_letter(c_idx)}{r_idx}"
            if isinstance(val, (int, float)):
                cells_xml.append(f'<c r="{ref}"><v>{val}</v></c>')
            else:
                val_text = escape(str(val))
                cells_xml.append(f'<c r="{ref}" t="inlineStr"><is><t>{val_text}</t></is></c>')
        rows_xml.append(f'<row r="{r_idx}">{"".join(cells_xml)}</row>')

    sheet_xml = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    {"".join(rows_xml)}
  </sheetData>
</worksheet>'''

    with zipfile.ZipFile(str(out_file), 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', content_types)
        z.writestr('_rels/.rels', root_rels)
        z.writestr('xl/_rels/workbook.xml.rels', wb_rels)
        z.writestr('xl/workbook.xml', wb_xml)
        z.writestr('xl/styles.xml', styles_xml)
        z.writestr('xl/worksheets/sheet1.xml', sheet_xml)

    return len(rows)


def _create_docx_pure(out_file: Path, title: str, subtitle: str, sections: List[Dict[str, Any]]) -> None:
    """Zero-dependency pure Python OpenXML .docx document generator."""
    out_file.parent.mkdir(parents=True, exist_ok=True)

    content_types = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>'''

    root_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>'''

    doc_body = []
    # Title
    safe_title = escape(title or "Document")
    doc_body.append(f'''
    <w:p>
      <w:pPr><w:jc w:val="left"/><w:spacing w:before="240" w:after="120"/></w:pPr>
      <w:r><w:rPr><w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI"/><w:b/><w:sz w:val="48"/><w:color w:val="0F172A"/></w:rPr><w:t>{safe_title}</w:t></w:r>
    </w:p>''')

    if subtitle:
        safe_sub = escape(subtitle)
        doc_body.append(f'''
        <w:p>
          <w:pPr><w:jc w:val="left"/><w:spacing w:before="0" w:after="360"/></w:pPr>
          <w:r><w:rPr><w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI"/><w:sz w:val="24"/><w:color w:val="64748B"/></w:rPr><w:t>{safe_sub}</w:t></w:r>
        </w:p>''')

    for sec in sections:
        sec_title = escape(sec.get("heading") or sec.get("title") or "")
        sec_content = sec.get("content") or sec.get("points") or []

        if sec_title:
            doc_body.append(f'''
            <w:p>
              <w:pPr><w:spacing w:before="280" w:after="100"/></w:pPr>
              <w:r><w:rPr><w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI"/><w:b/><w:sz w:val="32"/><w:color w:val="1E293B"/></w:rPr><w:t>{sec_title}</w:t></w:r>
            </w:p>''')

        if isinstance(sec_content, str):
            safe_text = escape(sec_content)
            doc_body.append(f'''
            <w:p>
              <w:pPr><w:spacing w:after="140"/></w:pPr>
              <w:r><w:rPr><w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI"/><w:sz w:val="22"/><w:color w:val="334155"/></w:rPr><w:t>{safe_text}</w:t></w:r>
            </w:p>''')
        elif isinstance(sec_content, list):
            for pt in sec_content:
                safe_pt = escape(str(pt))
                doc_body.append(f'''
                <w:p>
                  <w:pPr><w:spacing w:after="80"/><w:ind w:left="360"/></w:pPr>
                  <w:r><w:rPr><w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI"/><w:color w:val="6366F1"/><w:b/></w:rPr><w:t>• </w:t></w:r>
                  <w:r><w:rPr><w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI"/><w:sz w:val="22"/><w:color w:val="334155"/></w:rPr><w:t>{safe_pt}</w:t></w:r>
                </w:p>''')

    doc_xml = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    {"".join(doc_body)}
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>'''

    with zipfile.ZipFile(str(out_file), 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', content_types)
        z.writestr('_rels/.rels', root_rels)
        z.writestr('word/document.xml', doc_xml)


@register("createExcelSpreadsheet")
def create_excel_spreadsheet(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Create an Excel spreadsheet (.xlsx) with headers, rows of data, and formatting.
    """
    title: str = args.get("title") or args.get("name") or "Spreadsheet"
    sheet_name: str = args.get("sheet_name") or "Data"
    headers: List[str] = args.get("headers") or []
    rows: List[List[Any]] = args.get("rows") or args.get("data") or []
    filename: Optional[str] = args.get("filename")
    save_folder: Optional[str] = args.get("save_folder") or "desktop"
    open_after: bool = args.get("open_after", True)

    out_path = _resolve_save_path(filename or f"{title.replace(' ', '_')}.xlsx", save_folder, ".xlsx")

    # If no headers provided, build standard financial/data template
    if not headers and not rows:
        headers = ["Item / Category", "Description", "Q1 Budget", "Q2 Budget", "Projected Revenue", "Status"]
        rows = [
            ["AI Agent Infrastructure", "Compute & API Gateway setup", 4500, 5200, 18000, "Active"],
            ["Frontend UI / Live2D", "Interactive visual avatar & styling", 3000, 3500, 12000, "Completed"],
            ["Automation Engine", "Windows & Office productivity tools", 4000, 4200, 15000, "Active"],
            ["Marketing & Growth", "Public SaaS launch & acquisition", 2500, 6000, 25000, "Planned"],
            ["Total Projection", "Consolidated quarterly outlook", 14000, 18900, 70000, "On Track"],
        ]

    row_count = _create_xlsx_pure(out_path, sheet_name, headers, rows)
    opened = _open_file(out_path) if open_after else False

    return {
        "result": f"Successfully created Excel spreadsheet '{out_path.name}' with {len(headers)} columns and {row_count} rows.",
        "path": str(out_path),
        "columns_count": len(headers),
        "rows_count": row_count,
        "opened": opened,
    }


@register("createDocument")
def create_document(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate a formatted Word document (.docx) or professional report.
    """
    title: str = args.get("title") or "Report"
    subtitle: str = args.get("subtitle") or "Prepared by Akari AI for Siddhant"
    sections: List[Dict[str, Any]] = args.get("sections") or []
    filename: Optional[str] = args.get("filename")
    save_folder: Optional[str] = args.get("save_folder") or "desktop"
    open_after: bool = args.get("open_after", True)

    out_path = _resolve_save_path(filename or f"{title.replace(' ', '_')}.docx", save_folder, ".docx")

    if not sections:
        sections = [
            {
                "heading": "1. Executive Summary",
                "content": f"Comprehensive overview and strategic implementation roadmap for {title}. Developed with autonomous AI orchestration."
            },
            {
                "heading": "2. Key Objectives & Milestones",
                "points": [
                    "High-speed multimodal AI execution across voice and vision",
                    "Seamless local operating system and office productivity automation",
                    "Enterprise-grade reliability and security guardrails"
                ]
            },
            {
                "heading": "3. Action Items & Next Steps",
                "points": [
                    "Deploy automated workflows to production environment",
                    "Review performance telemetry and user feedback metrics",
                    "Schedule collaborative review session"
                ]
            }
        ]

    _create_docx_pure(out_path, title, subtitle, sections)
    opened = _open_file(out_path) if open_after else False

    return {
        "result": f"Successfully created Word document '{out_path.name}' with {len(sections)} sections.",
        "path": str(out_path),
        "sections_count": len(sections),
        "opened": opened,
    }


__all__ = [
    "create_excel_spreadsheet",
    "create_document",
]
