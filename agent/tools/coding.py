"""
Coding assistance: create code files, run Python scripts, scaffold projects.

  createPythonFile   -> write a .py file (uses createFile semantics w/ safety)
  writeCodeFile      -> write an arbitrary-language file with proper extension
  createProjectFolder-> make a folder structure (with optional subfolders)
  runPythonScript    -> execute a .py file with the known-good interpreter,
                        capturing stdout/stderr and exit code.

The Python interpreter used for running scripts is auto-detected so it works
even when the bare `python` shim is broken (common on this machine).
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..registry import ToolError, register
from .files import _ensure_safe, _ensure_writable, get_workspace_dir


# Extension map for writeCodeFile.
LANG_EXT: Dict[str, str] = {
    "python": "py",
    "py": "py",
    "javascript": "js",
    "js": "js",
    "typescript": "ts",
    "ts": "ts",
    "html": "html",
    "css": "css",
    "json": "json",
    "markdown": "md",
    "md": "md",
    "java": "java",
    "c": "c",
    "cpp": "cpp",
    "csharp": "cs",
    "cs": "cs",
    "go": "go",
    "rust": "rs",
    "rs": "rs",
    "ruby": "rb",
    "rb": "rb",
    "php": "php",
    "shell": "sh",
    "bash": "sh",
    "sh": "sh",
    "sql": "sql",
    "yaml": "yaml",
    "yml": "yaml",
    "xml": "xml",
    "text": "txt",
    "txt": "txt",
}


def _detect_python() -> str:
    exe = sys.executable
    if exe and Path(exe).exists():
        return exe
    import platform
    if platform.system() == "Windows":
        local_app_data = os.environ.get("LOCALAPPDATA", r"C:\Users\Default\AppData\Local")
        candidates = [
            os.path.join(local_app_data, "Programs", "Python", "Python312", "python.exe"),
            os.path.join(local_app_data, "Programs", "Python", "Python311", "python.exe"),
            r"C:\Python312\python.exe",
            r"C:\Python311\python.exe",
        ]
        for c in candidates:
            if os.path.exists(c):
                return c
                
    for c in ["python", "python3"]:
        if shutil.which(c):
            return c
    raise ToolError("No usable Python interpreter found on this system.")


@register("createPythonFile")
def create_python_file(args: Dict[str, Any]) -> Dict[str, Any]:
    raw_path = args.get("path") or args.get("filename") or args.get("file_path") or args.get("file")
    content = args.get("content") or args.get("code") or ""
    if not raw_path:
        raise ToolError("Parameter 'path' is required.")

    p = Path(os.path.expandvars(os.path.expanduser(str(raw_path))))
    if not p.is_absolute():
        p = (get_workspace_dir() / p).resolve()
    else:
        p = p.resolve()

    if p.suffix.lower() != ".py":
        p = p.with_suffix(".py")

    _ensure_writable(p, allow_external=bool(args.get("allow_external", False)))
    if p.exists() and not args.get("overwrite", True):
        raise ToolError(f"File already exists: {p}. Pass overwrite=true to replace.")

    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(str(content) + ("" if str(content).endswith("\n") else "\n"), encoding="utf-8")
    return {
        "status": "success",
        "result": f"Saved Python file to {p}. Would you like me to open this folder?",
        "path": str(p),
        "folder": str(p.parent),
        "workspace_dir": str(get_workspace_dir()),
    }


@register("writeCodeFile")
def write_code_file(args: Dict[str, Any]) -> Dict[str, Any]:
    raw_path = args.get("path") or args.get("filename") or args.get("file_path") or args.get("file")
    content = args.get("content") or args.get("code") or ""
    language = (args.get("language") or "txt").strip().lower()
    if not raw_path:
        raise ToolError("Parameter 'path' is required.")

    p = Path(os.path.expandvars(os.path.expanduser(str(raw_path))))
    if not p.is_absolute():
        p = (get_workspace_dir() / p).resolve()
    else:
        p = p.resolve()

    # If the caller gave a basename without extension, append the language's.
    ext = LANG_EXT.get(language)
    if ext and p.suffix == "":
        p = p.with_suffix("." + ext)

    _ensure_writable(p, allow_external=bool(args.get("allow_external", False)))
    if p.exists() and not args.get("overwrite", True):
        raise ToolError(f"File already exists: {p}. Pass overwrite=true to replace.")

    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(str(content), encoding="utf-8")
    return {
        "status": "success",
        "result": f"Saved {language} file to {p}. Would you like me to open this folder?",
        "path": str(p),
        "folder": str(p.parent),
        "workspace_dir": str(get_workspace_dir()),
    }


@register("createProjectFolder")
def create_project_folder(args: Dict[str, Any]) -> Dict[str, Any]:
    raw_path = args.get("path") or args.get("folder_name") or args.get("name") or args.get("folder")
    if not raw_path:
        raise ToolError("Parameter 'path' (project root) is required.")

    root = Path(os.path.expandvars(os.path.expanduser(str(raw_path))))
    if not root.is_absolute():
        root = (get_workspace_dir() / root).resolve()
    else:
        root = root.resolve()

    _ensure_writable(root, allow_external=bool(args.get("allow_external", False)))
    root.mkdir(parents=True, exist_ok=True)

    subfolders: List[str] = args.get("subfolders") or args.get("structure") or []
    created = [str(root)]
    default_scaffold = {
        "src": None,
        "tests": None,
        "docs": None,
    }
    if args.get("scaffold_standard", False):
        for sub in default_scaffold:
            sp = root / sub
            sp.mkdir(exist_ok=True)
            created.append(str(sp))
    if subfolders:
        for sub in subfolders:
            sp = (root / str(sub)).resolve()
            _ensure_writable(sp, allow_external=bool(args.get("allow_external", False)))
            sp.mkdir(parents=True, exist_ok=True)
            created.append(str(sp))

    # Optional starter files.
    files: Dict[str, str] = args.get("files") or {}
    for rel, content in files.items():
        fp = (root / str(rel)).resolve()
        _ensure_writable(fp, allow_external=bool(args.get("allow_external", False)))
        fp.parent.mkdir(parents=True, exist_ok=True)
        fp.write_text(str(content), encoding="utf-8")
        created.append(str(fp))

    return {
        "status": "success",
        "result": f"Created project folder at {root}. Would you like me to open this folder?",
        "path": str(root),
        "folder": str(root),
        "workspace_dir": str(get_workspace_dir()),
        "created": created,
    }


@register("runPythonScript")
def run_python_script(args: Dict[str, Any]) -> Dict[str, Any]:
    path = args.get("path") or args.get("script_path") or args.get("script") or args.get("filename")
    if not path:
        raise ToolError("Parameter 'path' (script path) is required.")
    raw = Path(os.path.expandvars(os.path.expanduser(str(path))))
    if not raw.is_absolute():
        # Check workspace first
        ws_cand = (get_workspace_dir() / raw).resolve()
        if ws_cand.exists() or ws_cand.with_suffix(".py").exists():
            p = ws_cand
        else:
            p = raw.resolve()
    else:
        p = raw.resolve()

    _ensure_safe(p)
    if not p.exists():
        if p.suffix.lower() != ".py" and p.with_suffix(".py").exists():
            p = p.with_suffix(".py")
        else:
            raise ToolError(f"Script does not exist: {p}")

    interpreter = _detect_python()
    script_args: List[str] = args.get("args") or []
    if isinstance(script_args, str):
        script_args = [script_args]
    timeout = int(args.get("timeout", 30))

    cmd = [interpreter, str(p)] + [str(a) for a in script_args]
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(p.parent),
        )
    except subprocess.TimeoutExpired:
        return {
            "result": f"Script timed out after {timeout}s.",
            "stdout": "",
            "stderr": f"Execution exceeded {timeout}s and was terminated.",
            "exit_code": None,
            "timed_out": True,
        }
    out = (proc.stdout or "")
    err = (proc.stderr or "")
    # Trim large outputs.
    if len(out) > 8000:
        out = out[:8000] + "…[truncated]"
    if len(err) > 4000:
        err = err[:4000] + "…[truncated]"
    status = "completed successfully" if proc.returncode == 0 else f"exited with code {proc.returncode}"
    return {
        "result": f"Ran {p.name}: {status}.",
        "stdout": out,
        "stderr": err,
        "exit_code": proc.returncode,
    }


__all__ = [
    "create_python_file",
    "write_code_file",
    "create_project_folder",
    "run_python_script",
]
