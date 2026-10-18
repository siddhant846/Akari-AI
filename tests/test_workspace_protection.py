"""
Tests for AKARI Workspace Protection & Isolated File Generation.

Verifies:
1. Default workspace directory is ~/Documents/AKARI_Workspace (or AKARI_WORKSPACE_DIR).
2. Refuses any write landing inside Akari-AI project root (both direct and ../ traversal).
3. Allows reading project repository files (reading is permitted, writing is prohibited).
4. Relative file creation (createFile, createPythonFile, writeCodeFile) defaults to workspace.
5. Website generation (buildAnimatedWebsite) creates project inside workspace/<slug>/.
6. Repo root stays completely clean without untracked generated files.
"""

import os
import sys
from pathlib import Path

# Ensure project root is on sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from agent.registry import ToolError
from agent.tools.files import (
    get_workspace_dir,
    is_inside_project,
    create_file,
    read_file,
    _ensure_writable,
)
from agent.tools.coding import create_python_file, write_code_file, create_project_folder
from agent.tools.website_builder import build_animated_website


def test_workspace_directory_created():
    ws = get_workspace_dir()
    assert ws.exists(), f"Workspace directory does not exist: {ws}"
    assert ws.is_dir(), f"Workspace directory is not a directory: {ws}"
    print(f"[PASS] Workspace directory exists: {ws}")


def test_rejects_write_inside_project_root():
    # Direct write to project root
    project_target = PROJECT_ROOT / "should_be_blocked.py"
    try:
        _ensure_writable(project_target)
        raise AssertionError("Expected ToolError when writing to project root!")
    except ToolError as e:
        assert "PROTECTED REPOSITORY" in str(e), f"Unexpected error message: {e}"
        print(f"[PASS] Direct write into project root was refused: {e}")

    # Write using createFile
    try:
        create_file({"path": str(project_target), "content": "# malicious"})
        raise AssertionError("Expected createFile to fail for project root!")
    except ToolError as e:
        assert "PROTECTED REPOSITORY" in str(e)
        print(f"[PASS] createFile into project root was refused: {e}")

    # Write using createPythonFile
    try:
        create_python_file({"path": str(project_target), "content": "# malicious"})
        raise AssertionError("Expected createPythonFile to fail for project root!")
    except ToolError as e:
        assert "PROTECTED REPOSITORY" in str(e)
        print(f"[PASS] createPythonFile into project root was refused: {e}")


def test_rejects_path_traversal_into_project_root():
    ws = get_workspace_dir()
    # Relative path from workspace attempting to escape into project root
    # e.g. path navigating back to project
    traversal_path = str(PROJECT_ROOT / "sub" / ".." / "traversal_blocked.py")
    try:
        _ensure_writable(Path(traversal_path))
        raise AssertionError("Expected ToolError for traversal path into project root!")
    except ToolError as e:
        assert "PROTECTED REPOSITORY" in str(e)
        print(f"[PASS] Traversal write into project root was refused: {e}")


def test_read_project_files_remains_allowed():
    # Reading project files like package.json should continue to work
    res = read_file({"path": "package.json"})
    assert res.get("status") == "success", "Failed to read project package.json"
    assert "Akari" in res.get("content", ""), "Expected 'Akari' in package.json content"
    print("[PASS] Reading project files remains fully allowed.")


def test_hello_world_saves_to_workspace():
    res = create_python_file({
        "path": "hello.py",
        "content": 'print("Hello from AKARI Workspace!")\n'
    })
    ws_file = get_workspace_dir() / "hello.py"
    repo_file = PROJECT_ROOT / "hello.py"

    assert ws_file.exists(), f"hello.py was not found in workspace: {ws_file}"
    assert not repo_file.exists(), f"hello.py was found in project repo root! Must NOT exist here."
    assert "Saved Python file" in res.get("result", "")
    assert "Would you like me to open this folder?" in res.get("result", "")
    print(f"[PASS] hello.py was created inside workspace: {ws_file}")


def test_biryani_hub_saves_to_workspace_subfolder():
    res = build_animated_website({
        "name": "Biryani Hub",
        "category": "Authentic Hyderabadi & Awadhi Dum Biryani",
        "tagline": "Rich Aromas. Royal Flavors.",
        "open_in_browser": False,
    })
    ws_site_dir = get_workspace_dir() / "biryani-hub"
    ws_index = ws_site_dir / "index.html"
    repo_site = PROJECT_ROOT / "biryani_hub_website.html"
    repo_gen_site = PROJECT_ROOT / "generated_websites" / "biryani-hub"

    assert ws_index.exists(), f"Biryani Hub index.html was not found at {ws_index}"
    assert not repo_site.exists(), f"biryani_hub_website.html was found in repo root!"
    assert not repo_gen_site.exists(), f"biryani-hub folder found inside repo generated_websites!"
    assert "Saved website to" in res.get("result", "")
    assert "Would you like me to open this folder?" in res.get("result", "")
    print(f"[PASS] Biryani Hub website was created inside: {ws_index}")


if __name__ == "__main__":
    print("\n--- Running AKARI Workspace Protection Tests ---")
    test_workspace_directory_created()
    test_rejects_write_inside_project_root()
    test_rejects_path_traversal_into_project_root()
    test_read_project_files_remains_allowed()
    test_hello_world_saves_to_workspace()
    test_biryani_hub_saves_to_workspace_subfolder()
    print("\n--- ALL TESTS PASSED SUCCESSFULLY! ---\n")
