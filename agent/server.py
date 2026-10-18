"""
AKARI Desktop Control Agent — FastAPI entrypoint.

Single dispatch endpoint POST /execute { tool, args } -> { result } | { error }.
AKARI's Node bridge (server.ts) calls this over HTTP on 127.0.0.1:8765.

Run:
    uvicorn agent.server:app --host 127.0.0.1 --port 8765
or:
    python -m agent.server
"""

from __future__ import annotations

import asyncio
import inspect
import logging
import os
import sys
import traceback
from contextlib import asynccontextmanager
from typing import Any, Dict

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import __version__
from .registry import DESKTOP_TOOL_NAMES, TOOLS, ToolError, load_all

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("akari.desktop")

try:
    import pyautogui
    pyautogui.FAILSAFE = False
    pyautogui.PAUSE = 0.05
except Exception:
    pass

load_all()
log.info("Loaded %d desktop tools: %s", len(TOOLS), ", ".join(sorted(TOOLS)))


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("AKARI Desktop Control Agent v%s starting up.", __version__)
    try:
        from .wake_service import wake_service
        wake_service.start()
    except Exception as e:
        log.warning("Could not initialize wake word service: %s", e)

    try:
        from .tools.browser import warm_browser
        warm_browser()
    except Exception as e:
        log.warning("Could not pre-warm browser: %s", e)

    yield

    try:
        from .wake_service import wake_service
        wake_service.stop()
    except Exception:
        pass

    try:
        from .tools.browser import shutdown_browser

        shutdown_browser()
    except Exception as e:
        log.warning("Browser shutdown error: %s", e)
    log.info("AKARI Desktop Control Agent stopped.")


app = FastAPI(
    title="AKARI Desktop Control Agent",
    version=__version__,
    description="JARVIS-style desktop automation backend for AKARI.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ExecuteRequest(BaseModel):
    tool: str
    args: Dict[str, Any] = {}


class ExecuteResponse(BaseModel):
    ok: bool
    result: Any = None
    error: str | None = None
    tool: str = ""


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "tools": sorted(TOOLS),
        "tool_count": len(TOOLS),
    }


@app.get("/wake/status")
async def wake_status():
    from .wake_service import wake_service
    return wake_service.get_status()


@app.post("/wake")
async def wake_trigger(data: Dict[str, Any] = {}):
    from .wake_service import wake_service
    phrase = str(data.get("phrase", "wake up akari"))
    confidence = float(data.get("confidence", 0.9))
    source = str(data.get("source", "api"))
    wake_service.trigger_wake(phrase, confidence, source)
    return {"ok": True, "message": "Wake trigger processed."}


@app.get("/tools")
async def list_tools():
    return sorted(TOOLS)


@app.post("/execute", response_model=ExecuteResponse)
async def execute(req: ExecuteRequest) -> ExecuteResponse:
    tool_name = req.tool
    args = req.args or {}
    if tool_name not in TOOLS:
        load_all()
    if tool_name in ("createPresentation", "searchPresentationImages", "openPowerPoint", "readPresentation", "addSlideToPresentation"):
        try:
            import importlib
            import agent.tools.powerpoint
            importlib.reload(agent.tools.powerpoint)
        except Exception as err:
            log.warning("Could not hot-reload powerpoint module: %s", err)
    if tool_name in ("getNews", "searchWebAnswer", "searchGoogle", "searchWeb", "searchGoogleMaps", "searchGitHub"):
        try:
            import importlib
            import agent.tools.news
            import agent.tools.search
            importlib.reload(agent.tools.news)
            importlib.reload(agent.tools.search)
        except Exception as err:
            log.warning("Could not hot-reload news/search modules: %s", err)
    if tool_name in ("buildAnimatedWebsite", "researchDesignReferences", "qualityCheckWebsite", "searchAndBuildLocalWebsite"):
        try:
            import importlib
            import agent.tools.files
            importlib.reload(agent.tools.files)
            import agent.tools.reference_designer
            import agent.tools.website_templates
            import agent.tools.website_builder
            importlib.reload(agent.tools.reference_designer)
            importlib.reload(agent.tools.website_templates)
            importlib.reload(agent.tools.website_builder)
        except Exception as err:
            log.warning("Could not hot-reload website modules: %s", err)
    if tool_name not in TOOLS:
        return ExecuteResponse(ok=False, error=f"Unknown tool: {tool_name}", tool=tool_name)
    handler = TOOLS[tool_name]
    try:
        if inspect.iscoroutinefunction(handler):
            result = await handler(args)
        else:
            result = await asyncio.to_thread(handler, args)
        return ExecuteResponse(ok=True, result=result, tool=tool_name)
    except ToolError as e:
        return ExecuteResponse(ok=False, error=str(e), tool=tool_name)
    except Exception as e:
        log.exception("Tool %s failed", tool_name)
        return ExecuteResponse(ok=False, error=f"{type(e).__name__}: {e}", tool=tool_name)


def main() -> None:
    import uvicorn

    host = os.environ.get("AKARI_AGENT_HOST", "127.0.0.1")
    port = int(os.environ.get("AKARI_AGENT_PORT", "8765"))
    log.info("Launching uvicorn on %s:%d", host, port)
    uvicorn.run(
        "agent.server:app",
        host=host,
        port=port,
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    main()
