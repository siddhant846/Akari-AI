"""
PowerPoint presentation creation, management, and viewing.

Features:
  * createPresentation: Generate complete, beautifully styled multi-slide PowerPoint (.pptx)
    presentations with modern themes, titles, bullet points, key takeaways, and speaker notes.
  * openPowerPoint: Launch Microsoft PowerPoint application or open an existing presentation file.
  * readPresentation: Read and summarize slides, titles, and text contents of any .pptx file.
  * addSlideToPresentation: Append new slides to an existing .pptx file.
"""

from __future__ import annotations

import os
import re
import sys
import platform
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..registry import ToolError, register
from .files import HOME, FOLDER_ALIASES

# Safe save directories
DEFAULT_SAVE_DIR = HOME / "Desktop"

THEME_PALETTES = {
    "modern_dark": {
        "bg": (15, 17, 26),
        "title": (255, 255, 255),
        "subtitle": (148, 163, 184),
        "body": (226, 232, 240),
        "accent": (99, 102, 241),
        "card_bg": (30, 41, 59),
    },
    "cyber_cyan": {
        "bg": (10, 15, 30),
        "title": (6, 182, 212),
        "subtitle": (165, 243, 252),
        "body": (224, 242, 254),
        "accent": (236, 72, 153),
        "card_bg": (15, 23, 42),
    },
    "minimal_white": {
        "bg": (255, 255, 255),
        "title": (15, 23, 42),
        "subtitle": (71, 85, 105),
        "body": (51, 65, 85),
        "accent": (37, 99, 235),
        "card_bg": (241, 245, 249),
    },
    "corporate_blue": {
        "bg": (248, 250, 252),
        "title": (30, 58, 138),
        "subtitle": (71, 85, 105),
        "body": (30, 41, 59),
        "accent": (2, 132, 199),
        "card_bg": (255, 255, 255),
    },
    "sunset_gradient": {
        "bg": (24, 15, 30),
        "title": (251, 146, 60),
        "subtitle": (244, 114, 182),
        "body": (254, 215, 226),
        "accent": (244, 63, 94),
        "card_bg": (45, 26, 56),
    },
    "emerald_green": {
        "bg": (6, 24, 18),
        "title": (52, 211, 153),
        "subtitle": (167, 243, 208),
        "body": (209, 250, 229),
        "accent": (16, 185, 129),
        "card_bg": (15, 46, 36),
    },
}


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

    # Clean filename
    filename = re.sub(r'[\\/*?:"<>|]', "", filename)
    return target_dir / filename


def _open_file_in_os(path: Path) -> bool:
    """Open a .pptx file in the OS default presentation application."""
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


def _create_pptx_pure(out_file: Path, title: str, subtitle: str, slides: List[Dict[str, Any]], palette: Dict[str, Any]) -> int:
    import zipfile
    from xml.sax.saxutils import escape

    bg_hex = f"{palette['bg'][0]:02X}{palette['bg'][1]:02X}{palette['bg'][2]:02X}"
    title_hex = f"{palette['title'][0]:02X}{palette['title'][1]:02X}{palette['title'][2]:02X}"
    sub_hex = f"{palette['subtitle'][0]:02X}{palette['subtitle'][1]:02X}{palette['subtitle'][2]:02X}"
    body_hex = f"{palette['body'][0]:02X}{palette['body'][1]:02X}{palette['body'][2]:02X}"
    accent_hex = f"{palette['accent'][0]:02X}{palette['accent'][1]:02X}{palette['accent'][2]:02X}"
    card_hex = f"{palette['card_bg'][0]:02X}{palette['card_bg'][1]:02X}{palette['card_bg'][2]:02X}"

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
      <a:lt2><a:srgbClr val="{body_hex}"/></a:lt2>
      <a:accent1><a:srgbClr val="{accent_hex}"/></a:accent1>
      <a:accent2><a:srgbClr val="{title_hex}"/></a:accent2>
      <a:accent3><a:srgbClr val="{sub_hex}"/></a:accent3>
      <a:accent4><a:srgbClr val="38BDF8"/></a:accent4>
      <a:accent5><a:srgbClr val="A855F7"/></a:accent5>
      <a:accent6><a:srgbClr val="EC4899"/></a:accent6>
      <a:hlink><a:srgbClr val="{accent_hex}"/></a:hlink>
      <a:folHlink><a:srgbClr val="{sub_hex}"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="AkariFont">
      <a:majorFont><a:latin typeface="Segoe UI"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
      <a:minorFont><a:latin typeface="Segoe UI"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="AkariFmt">
      <a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
      <a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="25400"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="38100"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
      <a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
      <a:bgFillStyleLst><a:solidFill><a:srgbClr val="{bg_hex}"/></a:solidFill><a:solidFill><a:srgbClr val="{card_hex}"/></a:solidFill><a:solidFill><a:srgbClr val="{bg_hex}"/></a:solidFill></a:bgFillStyleLst>
    </a:fmtScheme>
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

    for idx, s in enumerate(all_slides, 1):
        s_title = escape(s.get("title") or f"Slide {idx}")
        s_sub = escape(s.get("subtitle") or "")
        points = s.get("points") or []
        is_title = s.get("type") == "title"
        shapes_xml = []

        shapes_xml.append(f'''
        <p:sp>
          <p:nvSpPr><p:cNvPr id="2" name="SlideBg"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
          <p:spPr>
            <a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/></a:xfrm>
            <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
            <a:solidFill><a:srgbClr val="{bg_hex}"/></a:solidFill>
          </p:spPr>
        </p:sp>''')

        if is_title:
            shapes_xml.append(f'''
            <p:sp>
              <p:nvSpPr><p:cNvPr id="3" name="AccentBar"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
              <p:spPr>
                <a:xfrm><a:off x="1097280" y="2011680"/><a:ext cx="164592" cy="2560320"/></a:xfrm>
                <a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom>
                <a:solidFill><a:srgbClr val="{accent_hex}"/></a:solidFill>
              </p:spPr>
            </p:sp>
            <p:sp>
              <p:nvSpPr><p:cNvPr id="4" name="TitleBox"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
              <p:spPr>
                <a:xfrm><a:off x="1463040" y="1828800"/><a:ext cx="9601200" cy="2926080"/></a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                <a:noFill/>
              </p:spPr>
              <p:txBody>
                <a:bodyPr wrap="square" rtlCol="0"/>
                <a:lstStyle/>
                <a:p>
                  <a:pPr algn="l"/>
                  <a:r>
                    <a:rPr lang="en-US" sz="4400" b="1"><a:solidFill><a:srgbClr val="{title_hex}"/></a:solidFill><a:latin typeface="Segoe UI"/></a:rPr>
                    <a:t>{s_title}</a:t>
                  </a:r>
                </a:p>
                <a:p>
                  <a:pPr algn="l" spcBfr="1800"/>
                  <a:r>
                    <a:rPr lang="en-US" sz="2200"><a:solidFill><a:srgbClr val="{sub_hex}"/></a:solidFill><a:latin typeface="Segoe UI"/></a:rPr>
                    <a:t>{s_sub}</a:t>
                  </a:r>
                </a:p>
              </p:txBody>
            </p:sp>''')
        else:
            shapes_xml.append(f'''
            <p:sp>
              <p:nvSpPr><p:cNvPr id="3" name="HeaderAccent"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
              <p:spPr>
                <a:xfrm><a:off x="914400" y="548640"/><a:ext cx="109728" cy="731520"/></a:xfrm>
                <a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom>
                <a:solidFill><a:srgbClr val="{accent_hex}"/></a:solidFill>
              </p:spPr>
            </p:sp>
            <p:sp>
              <p:nvSpPr><p:cNvPr id="4" name="SlideTitle"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
              <p:spPr>
                <a:xfrm><a:off x="1188720" y="457200"/><a:ext cx="10058400" cy="914400"/></a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                <a:noFill/>
              </p:spPr>
              <p:txBody>
                <a:bodyPr wrap="square" rtlCol="0"/>
                <a:lstStyle/>
                <a:p>
                  <a:pPr algn="l"/>
                  <a:r>
                    <a:rPr lang="en-US" sz="2800" b="1"><a:solidFill><a:srgbClr val="{title_hex}"/></a:solidFill><a:latin typeface="Segoe UI"/></a:rPr>
                    <a:t>{s_title}</a:t>
                  </a:r>
                </a:p>
              </p:txBody>
            </p:sp>
            <p:sp>
              <p:nvSpPr><p:cNvPr id="5" name="ContentCard"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
              <p:spPr>
                <a:xfrm><a:off x="914400" y="1645920"/><a:ext cx="10363200" cy="4572000"/></a:xfrm>
                <a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom>
                <a:solidFill><a:srgbClr val="{card_hex}"/></a:solidFill>
                <a:ln w="12700"><a:solidFill><a:srgbClr val="{accent_hex}"/></a:solidFill></a:ln>
              </p:spPr>
            </p:sp>''')

            paras = []
            for p_idx, pt in enumerate(points):
                escaped_pt = escape(str(pt))
                paras.append(f'''
                <a:p>
                  <a:pPr algn="l" spcBfr="{"0" if p_idx == 0 else "1400"}"/>
                  <a:r>
                    <a:rPr lang="en-US" sz="1800"><a:solidFill><a:srgbClr val="{accent_hex}"/></a:solidFill><a:latin typeface="Segoe UI"/></a:rPr>
                    <a:t>•   </a:t>
                  </a:r>
                  <a:r>
                    <a:rPr lang="en-US" sz="1800"><a:solidFill><a:srgbClr val="{body_hex}"/></a:solidFill><a:latin typeface="Segoe UI"/></a:rPr>
                    <a:t>{escaped_pt}</a:t>
                  </a:r>
                </a:p>''')

            all_paras_str = "\n".join(paras)
            shapes_xml.append(f'''
            <p:sp>
              <p:nvSpPr><p:cNvPr id="6" name="PointsBox"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
              <p:spPr>
                <a:xfrm><a:off x="1188720" y="1920240"/><a:ext cx="9814560" cy="4023360"/></a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                <a:noFill/>
              </p:spPr>
              <p:txBody>
                <a:bodyPr wrap="square" rtlCol="0"/>
                <a:lstStyle/>
                {all_paras_str}
              </p:txBody>
            </p:sp>''')

        slide_shapes_combined = "".join(shapes_xml)
        slide_xml = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      {slide_shapes_combined}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>'''
        slide_xml_list.append(slide_xml)

        slide_rel = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>'''
        slide_rels_list.append(slide_rel)

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


from ..deepseek_client import generate_presentation_deck


@register("createPresentation")
def create_presentation(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Create a complete, beautifully designed PowerPoint presentation (.pptx).
    """
    topic: str = args.get("topic") or args.get("title") or "Presentation"
    title: str = args.get("title") or topic
    subtitle: str = args.get("subtitle") or "Prepared by Akari AI for Siddhant"
    slides_input: Optional[List[Dict[str, Any]]] = args.get("slides")
    theme_name: str = str(args.get("theme") or "modern_dark").lower()
    filename: Optional[str] = args.get("filename")
    save_folder: Optional[str] = args.get("save_folder") or "desktop"
    open_after: bool = args.get("open_after", True)
    deepseek_key: Optional[str] = args.get("deepseek_api_key")

    palette = THEME_PALETTES.get(theme_name, THEME_PALETTES["modern_dark"])
    out_path = _resolve_save_path(filename or f"{title.replace(' ', '_')}.pptx", save_folder)

    # If no custom slides provided, check if DeepSeek AI is available to generate tailored content
    if not slides_input:
        ds_slides = generate_presentation_deck(topic, api_key=deepseek_key)
        if ds_slides:
            slides_input = ds_slides

    # Standard default structure if still no custom slides provided
    if not slides_input:
        deck_slides = [
            {
                "title": f"Executive Overview: {topic}",
                "points": [
                    f"Core concept and primary motivation behind {topic}",
                    "Key objectives and scope of execution",
                    "Market context, historical background, and current landscape",
                    "Target audience and major stakeholder impact",
                ],
            },
            {
                "title": "Key Pillars & Core Architecture",
                "points": [
                    "Fundamental building blocks and foundational mechanisms",
                    "Modular framework designed for scalability and high performance",
                    "Seamless integration with existing ecosystems and automated workflows",
                    "Security, reliability, and precision guardrails in practice",
                ],
            },
            {
                "title": "Major Capabilities & Strategic Value",
                "points": [
                    "High-speed efficiency with minimal turnaround delay",
                    "Autonomous precision and multimodal intelligence",
                    "Streamlined operational bandwidth and productivity multiplication",
                    "Extensible design adaptable to custom workflows and scaling",
                ],
            },
            {
                "title": "Implementation Roadmap & Next Steps",
                "points": [
                    "Phase 1: Foundation deployment and requirement validation",
                    "Phase 2: Core integration, data synchronization, and pipeline testing",
                    "Phase 3: Production rollout, automated monitoring, and scaling",
                    "Next Action: Review milestones and initiate scheduled tasks",
                ],
            },
            {
                "title": "Conclusion & Strategic Summary",
                "points": [
                    f"Strategic importance of {topic} for long-term growth",
                    "Key milestones achieved and future trajectory",
                    "Open floor for questions and collaborative discussion",
                ],
            }
        ]
    else:
        deck_slides = []
        for s in slides_input:
            s_title = s.get("title") or "Key Insights"
            s_points = s.get("points") or s.get("content") or []
            if isinstance(s_points, str):
                s_points = [p.strip() for p in s_points.split("\n") if p.strip()]
            deck_slides.append({
                "title": s_title,
                "points": s_points,
                "notes": s.get("notes"),
                "layout": s.get("layout") or "content"
            })

    # Try python-pptx first, fallback to pure OpenXML builder
    slide_count = 0
    used_engine = "pure_openxml"
    try:
        from pptx import Presentation
        from pptx.util import Inches, Pt
        from pptx.dml.color import RGBColor
        from pptx.enum.shapes import MSO_SHAPE

        prs = Presentation()
        prs.slide_width = Inches(13.333)
        prs.slide_height = Inches(7.5)
        blank_layout = prs.slide_layouts[6]

        def apply_bg(slide, color_rgb):
            bg_s = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(7.5))
            bg_s.fill.solid()
            bg_s.fill.fore_color.rgb = RGBColor(*color_rgb)
            bg_s.line.fill.background()

        # Title slide
        t_slide = prs.slides.add_slide(blank_layout)
        apply_bg(t_slide, palette["bg"])
        bar = t_slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.2), Inches(2.2), Inches(0.18), Inches(2.8))
        bar.fill.solid()
        bar.fill.fore_color.rgb = RGBColor(*palette["accent"])
        bar.line.fill.background()

        t_box = t_slide.shapes.add_textbox(Inches(1.6), Inches(2.0), Inches(10.5), Inches(3.2))
        tf = t_box.text_frame
        tf.word_wrap = True
        p1 = tf.paragraphs[0]
        p1.text = title
        p1.font.bold = True
        p1.font.size = Pt(44)
        p1.font.color.rgb = RGBColor(*palette["title"])
        p1.font.name = "Segoe UI"
        if subtitle:
            p2 = tf.add_paragraph()
            p2.text = subtitle
            p2.font.size = Pt(22)
            p2.font.color.rgb = RGBColor(*palette["subtitle"])
            p2.font.name = "Segoe UI"
            p2.space_before = Pt(18)

        # Content slides
        for s in deck_slides:
            slide = prs.slides.add_slide(blank_layout)
            apply_bg(slide, palette["bg"])

            top_pill = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.9), Inches(0.65), Inches(0.12), Inches(0.65))
            top_pill.fill.solid()
            top_pill.fill.fore_color.rgb = RGBColor(*palette["accent"])
            top_pill.line.fill.background()

            st_box = slide.shapes.add_textbox(Inches(1.2), Inches(0.55), Inches(11.0), Inches(1.0))
            stf = st_box.text_frame
            stf.word_wrap = True
            stp = stf.paragraphs[0]
            stp.text = s["title"]
            stp.font.bold = True
            stp.font.size = Pt(28)
            stp.font.color.rgb = RGBColor(*palette["title"])
            stp.font.name = "Segoe UI"

            card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.9), Inches(1.8), Inches(11.4), Inches(4.9))
            card.fill.solid()
            card.fill.fore_color.rgb = RGBColor(*palette["card_bg"])
            card.line.color.rgb = RGBColor(*palette["accent"])
            card.line.width = Pt(1)

            c_box = slide.shapes.add_textbox(Inches(1.3), Inches(2.1), Inches(10.6), Inches(4.4))
            cf = c_box.text_frame
            cf.word_wrap = True
            for i, pt_text in enumerate(s["points"]):
                cp = cf.paragraphs[0] if i == 0 else cf.add_paragraph()
                cp.text = f"•  {pt_text.strip()}"
                cp.font.size = Pt(18)
                cp.font.color.rgb = RGBColor(*palette["body"])
                cp.font.name = "Segoe UI"
                cp.space_before = Pt(16)

        prs.save(str(out_path))
        slide_count = len(prs.slides)
        used_engine = "python-pptx"
    except Exception:
        slide_count = _create_pptx_pure(out_path, title, subtitle, deck_slides, palette)
        used_engine = "pure_openxml"

    opened = False
    if open_after:
        opened = _open_file_in_os(out_path)

    return {
        "result": f"Successfully created presentation '{out_path.name}' with {slide_count} slides.",
        "path": str(out_path),
        "slides_count": slide_count,
        "theme": theme_name,
        "opened": opened,
        "engine": used_engine,
    }


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

        # 1. Direct path check
        if p.is_absolute() and p.exists():
            target_file = p
        else:
            # 2. Search in common folders
            clean_query = query.lower().replace(".pptx", "").replace(".ppt", "")
            
            # Exact or prefix match
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

            # Substring match if not found
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

    # 3. If no specific query given or not found by name, find most recently modified presentation
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
            # Sort by newest modification time
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

    # 4. Fallback: Launch Microsoft PowerPoint application itself
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

        for idx, slide in enumerate(prs.slides, start=1):
            texts: List[str] = []
            title = f"Slide {idx}"

            for shape in slide.shapes:
                if shape.has_text_frame:
                    for paragraph in shape.text_frame.paragraphs:
                        t = paragraph.text.strip()
                        if t:
                            texts.append(t)

            if texts:
                title = texts[0]

            slides_data.append({
                "slide_number": idx,
                "title": title,
                "content": texts,
            })

        return {
            "file_name": p.name,
            "path": str(p),
            "total_slides": len(prs.slides),
            "slides": slides_data,
        }
    except Exception:
        # High-resilience pure-Python zipfile & ElementTree fallback
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

    try:
        from pptx import Presentation
        from pptx.util import Inches, Pt
        from pptx.dml.color import RGBColor
        from pptx.enum.shapes import MSO_SHAPE

        prs = Presentation(str(p))
        blank_layout = prs.slide_layouts[6]
        slide = prs.slides.add_slide(blank_layout)

        # Title
        t_box = slide.shapes.add_textbox(Inches(1.0), Inches(0.6), Inches(11.0), Inches(1.0))
        tf = t_box.text_frame
        p_title = tf.paragraphs[0]
        p_title.text = slide_title
        p_title.font.bold = True
        p_title.font.size = Pt(28)
        p_title.font.color.rgb = RGBColor(15, 23, 42)

        # Points
        c_box = slide.shapes.add_textbox(Inches(1.2), Inches(1.8), Inches(10.5), Inches(4.8))
        cf = c_box.text_frame
        cf.word_wrap = True

        for i, pt in enumerate(points):
            cp = cf.paragraphs[0] if i == 0 else cf.add_paragraph()
            cp.text = f"•  {pt}"
            cp.font.size = Pt(18)
            cp.font.color.rgb = RGBColor(51, 65, 85)
            cp.space_before = Pt(14)

        prs.save(str(p))
        total_slides = len(prs.slides)
    except Exception:
        # Pure OpenXML append fallback
        read_res = read_presentation({"path": str(p)})
        existing_slides = read_res.get("slides", [])
        deck_slides = []
        for s in existing_slides[1:]:  # skip title slide
            deck_slides.append({
                "title": s["title"],
                "points": s["content"][1:] if len(s["content"]) > 1 else s["content"]
            })
        deck_slides.append({
            "title": slide_title,
            "points": points
        })
        first_title = existing_slides[0]["title"] if existing_slides else "Presentation"
        first_sub = existing_slides[0]["content"][1] if existing_slides and len(existing_slides[0]["content"]) > 1 else ""
        total_slides = _create_pptx_pure(p, first_title, first_sub, deck_slides, THEME_PALETTES["modern_dark"])

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
