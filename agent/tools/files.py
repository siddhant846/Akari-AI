"""
File management: create / read / rename / delete / move / open / search.

Safety model:
  * All paths are resolved with expanduser and normalized to absolute.
  * Deletion sends files/folders to the Recycle Bin via `send2trash` when
    available (preferred), and otherwise refuses to delete rather than
    permanently removing data.
  * Operations are confined to a set of SAFE_ROOTS by default; paths that
    escape these roots (e.g. C:\\Windows) are rejected unless explicitly
    marked `allow_anywhere` by the caller.
"""

from __future__ import annotations

import fnmatch
import os
import platform
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..registry import ToolError, register

HOME = Path(os.path.expanduser("~"))

if platform.system() == "Windows":
    _ROOT = Path("C:\\")
elif platform.system() == "Darwin":
    _ROOT = Path("/System/Volumes/Data")
else:
    _ROOT = Path("/")

# Roots under which file operations are freely permitted.
SAFE_ROOTS: List[Path] = [
    HOME,
    HOME / "Desktop",
    HOME / "Documents",
    HOME / "Downloads",
    HOME / "Pictures",
    HOME / "Music",
    HOME / "Videos",
    Path(os.getcwd()),  # project root

]

# Friendly folder aliases -> resolved path.
FOLDER_ALIASES: Dict[str, Path] = {
    "workspace": HOME / "Documents" / "AKARI_Workspace",
    "desktop": HOME / "Desktop",
    "documents": HOME / "Documents",
    "downloads": HOME / "Downloads",
    "pictures": HOME / "Pictures",
    "photos": HOME / "Pictures",
    "music": HOME / "Music",
    "videos": HOME / "Videos",
    "home": HOME,
    "this pc": _ROOT,
    "c drive": _ROOT,
}


def get_workspace_dir() -> Path:
    """Returns the dedicated AKARI workspace directory.
    Default: ~/Documents/AKARI_Workspace/
    Configurable via AKARI_WORKSPACE_DIR env var or .env file.
    Creates it automatically if missing.
    """
    env_dir = os.environ.get("AKARI_WORKSPACE_DIR")
    if not env_dir:
        # Check .env directly in case environment wasn't reloaded
        env_file = Path(__file__).resolve().parent.parent.parent / ".env"
        if env_file.exists():
            try:
                for line in env_file.read_text(encoding="utf-8").splitlines():
                    line = line.strip()
                    if line.startswith("AKARI_WORKSPACE_DIR="):
                        env_dir = line.split("=", 1)[1].strip().strip('"').strip("'")
                        break
            except Exception:
                pass
    if env_dir:
        ws = Path(os.path.expandvars(os.path.expanduser(env_dir))).resolve()
    else:
        ws = (HOME / "Documents" / "AKARI_Workspace").resolve()
    ws.mkdir(parents=True, exist_ok=True)
    return ws


# Roots under which read/search file operations are permitted.
SAFE_ROOTS: List[Path] = [
    HOME,
    HOME / "Desktop",
    HOME / "Documents",
    HOME / "Downloads",
    HOME / "Pictures",
    HOME / "Music",
    HOME / "Videos",
    Path(os.getcwd()),  # project root allowed for READ operations
    get_workspace_dir(),
]


def is_inside_project(p: Path) -> bool:
    """Checks whether path p resolves to anywhere inside the Akari-AI source code repository."""
    try:
        real_p = str(p.resolve())
        project_roots = [
            Path(__file__).resolve().parent.parent.parent,
            Path(os.getcwd()).resolve(),
        ]
        for pr in project_roots:
            real_pr = str(pr.resolve())
            if real_p == real_pr or real_p.startswith(real_pr + os.sep):
                return True
    except Exception:
        pass
    return False


def _ensure_writable(p: Path, allow_external: bool = False) -> None:
    """Enforces write protection:
    1. Rejects any write that lands inside the Akari-AI project directory (blocking ../ tricks).
    2. By default, ensures write lands within AKARI_Workspace (or explicitly confirmed external folder).
    """
    resolved = p.resolve()
    if is_inside_project(resolved):
        raise ToolError(
            f"PROTECTED REPOSITORY: Write refused for '{resolved}'. "
            f"AKARI generated files must never be saved inside the project's source code folder. "
            f"Save inside the workspace folder instead: {get_workspace_dir()}"
        )

    ws = get_workspace_dir()
    real = str(resolved)
    real_ws = str(ws)
    if real == real_ws or real.startswith(real_ws + os.sep):
        return

    if allow_external:
        return

    # Check safe external user folders (Desktop, Documents, Downloads)
    safe_external = [
        HOME / "Desktop",
        HOME / "Documents",
        HOME / "Downloads",
    ]
    for root in safe_external:
        try:
            root_real = str(root.resolve())
            if real == root_real or real.startswith(root_real + os.sep):
                return
        except Exception:
            continue

    raise ToolError(
        f"Write refused: Path '{resolved}' is outside AKARI_Workspace ({ws}). "
        f"Explicit user confirmation (allow_external=True) is required to save outside the workspace."
    )


def _resolve_folder(name_or_path: Optional[str]) -> Path:
    if not name_or_path:
        raise ToolError("Parameter 'name' or 'path' is required.")
    key = str(name_or_path).strip().lower()
    if key in FOLDER_ALIASES:
        return FOLDER_ALIASES[key]
    p = Path(os.path.expandvars(os.path.expanduser(str(name_or_path)))).resolve()
    return p


def _resolve_file(path: Optional[str], *, must_exist: bool = False, default_to_workspace: bool = True) -> Path:
    if not path:
        raise ToolError("Parameter 'path' is required.")
    raw = Path(os.path.expandvars(os.path.expanduser(str(path))))
    if not raw.is_absolute() and default_to_workspace:
        p = (get_workspace_dir() / raw).resolve()
    else:
        p = raw.resolve()
    if must_exist and not p.exists():
        # Fallback check if it exists in current working dir for read operations
        if raw.resolve().exists():
            return raw.resolve()
        raise ToolError(f"File does not exist: {p}")
    return p


def _ensure_safe(p: Path, allow_anywhere: bool = False) -> None:
    if allow_anywhere:
        return
    real = str(p.resolve())
    roots = list(SAFE_ROOTS) + [get_workspace_dir()]
    for root in roots:
        try:
            root_real = str(root.resolve())
        except Exception:
            continue
        if real == root_real or real.startswith(root_real + os.sep):
            return
    raise ToolError(
        f"Path '{p}' is outside AKARI's safe folders (Desktop, Documents, "
        f"Downloads, Pictures, Music, Videos, home, workspace, and project folder). "
        f"Pass allow_anywhere=true only if you really mean it."
    )


@register("createFile")
def create_file(args: Dict[str, Any]) -> Dict[str, Any]:
    path = args.get("path")
    content = args.get("content", "")
    overwrite = bool(args.get("overwrite", False))
    p = _resolve_file(path, default_to_workspace=True)
    _ensure_writable(p, allow_external=bool(args.get("allow_external", False)))

    if p.exists() and not overwrite:
        raise ToolError(
            f"File already exists: {p}. Pass overwrite=true to replace it."
        )
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(str(content), encoding="utf-8")
    return {
        "status": "success",
        "result": f"Saved file to {p}. Would you like me to open this folder?",
        "path": str(p),
        "folder": str(p.parent),
        "workspace_dir": str(get_workspace_dir()),
    }


@register("readFile")
def read_file(args: Dict[str, Any]) -> Dict[str, Any]:
    path = args.get("path")
    max_chars = int(args.get("max_chars", 8000))
    p = _resolve_file(path, must_exist=True)
    _ensure_safe(p)
    try:
        text = p.read_text(encoding="utf-8", errors="replace")
    except UnicodeDecodeError:
        return {"result": f"(Binary file, {p.stat().st_size} bytes): {p}"}
    if len(text) > max_chars:
        text = text[:max_chars] + f"\n…[truncated, {len(text) - max_chars} more chars]"
    return {"status": "success", "result": text, "content": text, "path": str(p)}


@register("renameFile")
def rename_file(args: Dict[str, Any]) -> Dict[str, Any]:
    path = args.get("path")
    new_name = args.get("new_name")
    if not new_name:
        raise ToolError("Parameter 'new_name' is required.")
    p = _resolve_file(path, must_exist=True)
    _ensure_safe(p)
    _ensure_writable(p, allow_external=bool(args.get("allow_external", False)))
    target = (p.parent / str(new_name)).resolve()
    _ensure_writable(target, allow_external=bool(args.get("allow_external", False)))
    if target.exists():
        raise ToolError(f"A file already exists at the target name: {target}")
    p.rename(target)
    return {"result": f"Renamed {p.name} -> {target.name}", "path": str(target)}


@register("deleteFile")
def delete_file(args: Dict[str, Any]) -> Dict[str, Any]:
    path = args.get("path")
    permanent = bool(args.get("permanent", False))
    p = _resolve_file(path, must_exist=True)
    _ensure_safe(p)
    _ensure_writable(p, allow_external=bool(args.get("allow_external", False)))

    if permanent:
        if p.is_dir():
            import shutil

            shutil.rmtree(p)
        else:
            p.unlink()
        return {"result": f"Permanently deleted: {p}"}

    # Prefer recycle bin.
    try:
        import send2trash  # type: ignore

        send2trash.send2trash(str(p))
        return {"result": f"Moved to Recycle Bin: {p}"}
    except ImportError:
        raise ToolError(
            "Safe deletion requires the 'send2trash' package. Install it or pass "
            "permanent=true (use with care)."
        )
    except Exception as e:  # noqa: BLE001
        raise ToolError(f"Could not move to Recycle Bin: {e}")


@register("moveFile")
def move_file(args: Dict[str, Any]) -> Dict[str, Any]:
    path = args.get("path")
    destination = args.get("destination")
    p = _resolve_file(path, must_exist=True)
    _ensure_safe(p)
    _ensure_writable(p, allow_external=bool(args.get("allow_external", False)))
    dest = Path(os.path.expandvars(os.path.expanduser(str(destination)))).resolve()
    # If destination is an existing directory, keep the filename.
    if dest.is_dir():
        dest = dest / p.name
    _ensure_writable(dest, allow_external=bool(args.get("allow_external", False)))
    if dest.exists():
        raise ToolError(f"Destination already exists: {dest}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    p.rename(dest)
    return {"result": f"Moved {p.name} -> {dest}", "path": str(dest)}


@register("openFolder")
def open_folder(args: Dict[str, Any]) -> Dict[str, Any]:
    folder = _resolve_folder(args.get("name") or args.get("path"))
    if not folder.exists():
        raise ToolError(f"Folder does not exist: {folder}")
    # Explorer on Windows, open elsewhere.
    if platform.system() == "Windows":
        subprocess.Popen(f'explorer "{folder}"', shell=True, close_fds=True)
    elif platform.system() == "Darwin":
        subprocess.Popen(["open", str(folder)], close_fds=True)
    else:
        subprocess.Popen(["xdg-open", str(folder)], close_fds=True)
    return {"result": f"Opened folder: {folder}", "path": str(folder)}


@register("openFile")
def open_file(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Open any document, file, image, PDF, presentation, or spreadsheet with its default system app.
    Intelligently searches Desktop, Downloads, Documents, and project directory if full path not given.
    """
    file_query: Optional[str] = args.get("path") or args.get("filename") or args.get("name")
    reveal = bool(args.get("reveal", False))

    if not file_query or not file_query.strip():
        raise ToolError("Please specify a filename or path to open.")

    query = file_query.strip()
    p = Path(os.path.expanduser(query))

    target_file: Optional[Path] = None

    if p.is_absolute() and p.exists():
        target_file = p
    else:
        search_folders = [
            get_workspace_dir(),
            HOME / "Desktop",
            HOME / "Downloads",
            HOME / "Documents",
            Path.cwd(),
            HOME,
        ]

        # 1. Exact match
        for folder in search_folders:
            if not folder.exists():
                continue
            cand = folder / query
            if cand.exists() and cand.is_file():
                target_file = cand
                break

        # 2. Case-insensitive search & extension matches
        if not target_file:
            clean_q = query.lower()
            for folder in search_folders:
                if not folder.exists():
                    continue
                try:
                    for cand in folder.iterdir():
                        if cand.is_file() and not cand.name.startswith("~$") and not cand.name.startswith(".~") and (cand.name.lower() == clean_q or cand.stem.lower() == clean_q or clean_q in cand.name.lower()):
                            target_file = cand
                            break
                except Exception:
                    pass
                if target_file:
                    break

    if not target_file or not target_file.exists():
        raise ToolError(f"Could not find file matching '{query}'.")

    try:
        if reveal and platform.system() == "Windows":
            subprocess.Popen(f'explorer /select,"{target_file}"', shell=True, close_fds=True)
            return {"result": f"Revealed '{target_file.name}' in File Explorer.", "path": str(target_file)}

        if platform.system() == "Windows":
            os.startfile(str(target_file))
        elif platform.system() == "Darwin":
            subprocess.Popen(["open", str(target_file)], close_fds=True)
        else:
            subprocess.Popen(["xdg-open", str(target_file)], close_fds=True)

        return {"result": f"Opened file '{target_file.name}' from {target_file.parent}.", "path": str(target_file)}
    except Exception as e:
        raise ToolError(f"Failed to open file '{target_file}': {e}")


@register("listFiles")
def list_files(args: Dict[str, Any]) -> Dict[str, Any]:
    folder = _resolve_folder(args.get("name") or args.get("path"))
    if not folder.exists():
        raise ToolError(f"Folder does not exist: {folder}")
    pattern = args.get("pattern") or "*"
    try:
        names = sorted(
            [p.name + ("/" if p.is_dir() else "") for p in folder.glob(pattern)]
        )
    except Exception as e:  # noqa: BLE001
        raise ToolError(f"Could not list folder: {e}")
    return {
        "result": f"{len(names)} item(s) in {folder}",
        "items": names[:500],
        "count": len(names),
    }


@register("searchFiles")
def search_files(args: Dict[str, Any]) -> Dict[str, Any]:
    """Find files by name glob or extension under a folder.

    Examples:
      name="*.py" under "Documents"          -> all python files
      extension="py"                          -> same as name="*.py"
      name="report*" under "Desktop"
    """
    folder = _resolve_folder(args.get("folder") or args.get("under") or "home")
    name = args.get("name") or args.get("pattern")
    extension = args.get("extension")
    limit = int(args.get("limit", 100))

    if extension:
        if not str(extension).startswith("."):
            extension = "." + str(extension)
        pattern = "*" + str(extension)
    elif name:
        pattern = str(name)
    else:
        raise ToolError("Provide 'name' glob or 'extension'.")

    if not folder.exists():
        raise ToolError(f"Folder does not exist: {folder}")

    matches: List[str] = []
    for root, _dirs, files in os.walk(folder):
        for fname in files:
            if fnmatch.fnmatch(fname.lower(), pattern.lower()):
                matches.append(os.path.join(root, fname))
                if len(matches) >= limit:
                    break
        if len(matches) >= limit:
            break

    return {
        "result": f"Found {len(matches)} file(s) matching '{pattern}' under {folder}",
        "matches": matches,
        "count": len(matches),
    }


__all__ = [
    "create_file",
    "read_file",
    "rename_file",
    "delete_file",
    "move_file",
    "open_folder",
    "list_files",
    "search_files",
]
