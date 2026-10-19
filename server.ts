import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { WebSocketServer } from "ws";
import { GoogleGenAI, Modality, Type, LiveServerMessage, StartSensitivity, EndSensitivity } from "@google/genai";
import dotenv from "dotenv";
import * as fs from "fs";
import { spawn, execSync } from "child_process";
import { 
  loadMemories, 
  saveMemories, 
  formatSystemInstructionsWithMemories, 
  processConversationSlice 
} from "./server_memory";
import {
  loadReminders,
  addReminder,
  getReminders,
  cancelReminder,
  startReminderTimer,
  setOnReminderFired,
} from "./server_reminders";
import { Memory } from "./src/lib/memoryTypes";
import { Reminder } from "./src/lib/reminderTypes";
import {
  DATA_DIR,
  dataFile,
  getGeminiApiKey,
  hasGeminiApiKey,
  setGeminiApiKey,
} from "./server_paths";
import { timingTracker } from "./server_timing";
import { getRoutedToolDeclarations, detectCategoriesFromText } from "./server_tools_routing";
import { getTaskInstructions } from "./server_task_instructions";

dotenv.config();

// ---------------------------------------------------------------------------
// AKARI V2 — Logging (Feature 7).
// Appends timestamped lines to logs/{commands,startup,errors}.log.
// Never throws; logging failures are swallowed so they can't break the app.
// ---------------------------------------------------------------------------
const LOGS_DIR = path.join(DATA_DIR, "logs");
try { fs.mkdirSync(LOGS_DIR, { recursive: true }); } catch { /* already exists */ }

function appendLog(fileName: string, message: string): void {
  try {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    fs.appendFile(path.join(LOGS_DIR, fileName), line, () => {});
  } catch {
    /* logging is best-effort */
  }
}
const logCommand = (m: string) => appendLog("commands.log", m);
const logStartup = (m: string) => appendLog("startup.log", m);
const logError = (m: string) => appendLog("errors.log", m);

// ---------------------------------------------------------------------------
// AKARI Desktop Control Agent — HTTP bridge to the Python FastAPI backend.
// ---------------------------------------------------------------------------
const DESKTOP_AGENT_URL = process.env.DESKTOP_AGENT_URL || "http://127.0.0.1:8765";
const DESKTOP_AGENT_TIMEOUT = 20_000; // ms (resilient network & scrape timeout protection)

/**
 * The complete set of tool names routed to the Python desktop agent.
 * Kept in sync with agent/registry.py DESKTOP_TOOL_NAMES.
 */
const DESKTOP_TOOLS: ReadonlySet<string> = new Set([
  // applications / websites / search / whatsapp / youtube
  "openApplication", "closeApplication", "whatsappSendMessage", "youtubeControl", "openWebsite",
  "searchWeb", "searchYouTube", "playYouTubeVideo", "selectYouTubeVideo", "clickYouTubeVideo", "playEpisode", "searchGoogle", "searchGitHub", "searchWebAnswer", "searchGoogleMaps",
  // files
  "createFile", "readFile", "renameFile", "deleteFile", "moveFile",
  "openFolder", "listFiles", "searchFiles", "openFile",
  // pc control (volume + gated power)
  "volumeUp", "volumeDown", "muteToggle", "setVolume",
  "requestPowerAction", "executePowerAction",
  // windows
  "minimizeWindow", "maximizeWindow", "closeWindow", "switchApplication",
  // clipboard
  "copySelected", "pasteClipboard", "getClipboard", "clearClipboard",
  // screenshot / screen reading
  "takeScreenshot", "saveScreenshot", "analyzeScreenshot", "readScreen",
  // browser automation (Playwright — desktop-owned, separate from holographic UI)
  "desktopBrowserOpen", "desktopBrowserNavigate", "desktopBrowserOpenTab",
  "desktopBrowserCloseTab", "desktopBrowserSearch", "desktopBrowserOpenYoutubeVideo",
  "desktopBrowserClick", "desktopBrowserType", "desktopBrowserFillForm", "desktopBrowserGoBack",
  "desktopBrowserGoForward", "desktopBrowserScroll",
  "desktopBrowserReadText", "desktopBrowserGetLinks",
  "desktopBrowserSetMode", "browserMediaControl",
  // coding assistance
  "createPythonFile", "runPythonScript", "createProjectFolder", "writeCodeFile",
  // system information
  "systemInfo", "gpuInfo", "temperatureInfo",
  // brightness control (V2)
  "brightnessUp", "brightnessDown", "setBrightness",
  // Windows auto-start management (V2)
  "enableAutoStart", "disableAutoStart", "getAutoStartStatus",
  // terminal
  "requestTerminalAction", "runTerminalCommand", "installPackage",
  "provideSudoPassword", "isCommandAllowed",
  // IITM BS (V2)
  "iitmQuickLinks", "iitmOpen", "iitmOpenCustom",
  // client-side holographic browser tools (routed to Python agent)
  "browserTabAction",
  // self-close
  "shutdownAkari",
  // weather
  "getWeather",
  // Hyprland workspace
  "switchWorkspace", "listWorkspaces", "moveToWorkspace",
  // news & live web search grounding
  "getNews", "searchWebAnswer", "searchGoogle", "searchWeb", "searchGoogleMaps", "searchGitHub",
  // conversation export
  "exportConversation", "listExports",
  // Google Calendar, Gmail, Tasks
  "getCalendarEvents", "createCalendarEvent",
  "sendEmail", "getEmails",
  "getTasks", "createTask",
  // OS input
  "osType", "osPress", "osClick",
  // camera control
  "cameraList", "cameraOn", "cameraOff",
  // PowerPoint & presentation generation
  "createPresentation", "searchPresentationImages", "openPowerPoint", "readPresentation", "addSlideToPresentation",
  // Office Suite (Excel & Word documents)
  "createExcelSpreadsheet", "createDocument",
  // Data Analytics & Visualization
  "analyzeData", "createDataChart",
  // Website Builder & Reference-Driven Design Engine
  "auditLocalBusinesses", "researchDesignReferences", "buildAnimatedWebsite", "qualityCheckWebsite", "searchAndBuildLocalWebsite", "akariBuilderPipeline",
]);

/**
 * Call the Python desktop agent.  Returns the parsed JSON response.
 * If the agent is unreachable, returns a user-friendly error payload.
 */
/**
 * Whether the desktop agent has been confirmed alive in this process lifetime.
 * If false, callDesktopAgent will probe /health and attempt an auto-spawn.
 */
let desktopAgentVerified = false;

// Track connected WebSocket clients for reminder notifications.
const connectedClients = new Set<any>();

/**
 * Auto-spawn the Python desktop agent as a detached child process if it is not
 * already listening. Looks for the project's bundled Python interpreter first,
 * falling back to `python` / `python3` on PATH. Runs detached so it survives
 * even if AKARI's node process is killed.
 */
function spawnDesktopAgent(): void {
  const agentEnv = {
    ...process.env,
    AKARI_AGENT_HOST: "127.0.0.1",
    AKARI_AGENT_PORT: "8765",
  };

  // Preferred path (packaged app): a PyInstaller-frozen agent exe that embeds
  // its own Python runtime. Set by the Electron main process via AKARI_AGENT_EXE.
  const frozenExe = process.env.AKARI_AGENT_EXE;
  if (frozenExe && fs.existsSync(frozenExe)) {
    try {
      const child = spawn(frozenExe, [], {
        cwd: path.dirname(frozenExe),
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        env: agentEnv,
      });
      child.unref();
      logStartup(`AGENT_SPAWN frozen exe pid=${child.pid} path=${frozenExe}`);
      console.log(`[Desktop Agent] Launched frozen agent (PID ${child.pid}).`);
      return;
    } catch (e: any) {
      logError(`AGENT_SPAWN_FROZEN_FAILED: ${e?.message || e}`);
    }
  }

  // Development fallback: check project venv first, then PATH
  const venvPyWin = path.join(process.cwd(), "venv", "Scripts", "python.exe");
  const venvPyLinux = path.join(process.cwd(), "venv", "bin", "python");
  const candidates = [
    fs.existsSync(venvPyWin) ? venvPyWin : null,
    fs.existsSync(venvPyLinux) ? venvPyLinux : null,
    process.env.AKARI_PYTHON,
    "python3",
    "python",
  ].filter(Boolean) as string[];

  const py = candidates.find((p) => {
    try {
      execSync(`"${p}" --version`, { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  });

  if (!py) {
    console.warn("[Desktop Agent] No frozen agent and no Python interpreter found; desktop control unavailable.");
    logError("AGENT_SPAWN_NO_RUNTIME: neither AKARI_AGENT_EXE nor Python available");
    return;
  }

  try {
    const child = spawn(
      py,
      ["run_agent.py"],
      { cwd: process.cwd(), detached: true, stdio: "ignore", windowsHide: false, env: agentEnv }
    );
    child.unref();
    logStartup(`AGENT_SPAWN python pid=${child.pid}`);
    console.log(`[Desktop Agent] Auto-spawned via Python (PID ${child.pid}).`);
  } catch (e: any) {
    console.warn(`[Desktop Agent] Auto-spawn failed: ${e?.message || e}`);
    logError(`AGENT_SPAWN_PYTHON_FAILED: ${e?.message || e}`);
  }
}

/**
 * Probe the desktop agent /health endpoint. Returns true if it responds 200.
 */
async function isDesktopAgentAlive(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${DESKTOP_AGENT_URL}/health`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Ensure the desktop agent is running. If not verified yet, probe health; if
 * down, auto-spawn and poll until it is ready (or timeout).
 */
async function ensureDesktopAgent(maxWaitSeconds = 4): Promise<void> {
  if (desktopAgentVerified) return;
  if (await isDesktopAgentAlive()) {
    desktopAgentVerified = true;
    console.log("[Desktop Agent] Already running.");
    return;
  }
  console.log("[Desktop Agent] Not detected. Auto-starting...");
  spawnDesktopAgent();
  for (let i = 1; i <= maxWaitSeconds; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await isDesktopAgentAlive()) {
      desktopAgentVerified = true;
      console.log(`[Desktop Agent] Online after ${i}s.`);
      return;
    }
  }
  console.warn(`[Desktop Agent] Did not come online within ${maxWaitSeconds}s. Desktop control will be unavailable.`);
}

async function callDesktopAgent(
  tool: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  // Lazy ensure: if we haven't verified the agent, quick probe
  if (!desktopAgentVerified) {
    await ensureDesktopAgent(3);
  }
  try {
    logCommand(`EXECUTE ${tool} ${JSON.stringify(args)}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DESKTOP_AGENT_TIMEOUT);

    const res = await fetch(`${DESKTOP_AGENT_URL}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool, args }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logError(`AGENT_HTTP_${res.status} ${tool}: ${text.substring(0,200)}`);
      return { ok: false, error: `Desktop agent HTTP ${res.status}: ${text}` };
    }
    return await res.json();
  } catch (err: any) {
    const isAbort = err?.name === "AbortError";
    // Only mark unverified if connection was genuinely refused/failed, not if a single tool took long
    if (!isAbort) {
      desktopAgentVerified = false;
    }
    const msg = isAbort
      ? "Desktop tool timed out."
      : "Desktop agent is unreachable. Please verify Python agent is running on port 8765.";
    logError(`AGENT_UNREACHABLE ${tool}: ${msg}`);
    return { ok: false, error: msg };
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json());

  // Memory REST API Endpoints
  app.get("/api/memories", async (req, res) => {
    try {
      const memories = await loadMemories();
      res.json(memories);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/memories", async (req, res) => {
    try {
      const { category, text } = req.body;
      if (!category || !text) {
        return res.status(400).json({ error: "Category and text parameters are required." });
      }
      const memories = await loadMemories();
      const timestamp = new Date().toISOString();
      const newMemory: Memory = {
        id: Math.random().toString(36).substring(2, 11),
        category,
        text,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      memories.push(newMemory);
      await saveMemories(memories);
      res.status(201).json(newMemory);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/memories/:id", async (req, res) => {
    try {
      const { id } = req.params;
      let memories = await loadMemories();
      memories = memories.filter(m => m.id !== id);
      await saveMemories(memories);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Turn timing logs API (Step 1 measurement)
  app.get("/api/timings", async (_req, res) => {
    res.json(timingTracker.getHistory());
  });
  app.get("/api/timings/summary", async (_req, res) => {
    res.json(timingTracker.getSummary());
  });

  // ---------------------------------------------------------------------------
  // V2: Reminder API — schedule timed reminders that fire via WebSocket.
  // ---------------------------------------------------------------------------
  app.get("/api/reminders", async (_req, res) => {
    try {
      res.json(getReminders());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/reminders", async (req, res) => {
    try {
      const { text, minutes } = req.body;
      if (!text || typeof minutes !== "number" || minutes <= 0) {
        return res.status(400).json({ error: "text and positive minutes are required." });
      }
      const reminder = addReminder(String(text), minutes);
      logCommand(`REMINDER_SET ${text} in ${minutes}m`);
      res.status(201).json(reminder);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/reminders/:id", async (req, res) => {
    try {
      const ok = cancelReminder(req.params.id);
      if (!ok) return res.status(404).json({ error: "Reminder not found." });
      logCommand(`REMINDER_CANCEL id=${req.params.id}`);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ---------------------------------------------------------------------------
  // V2: Settings API — mirrors the memory persistence pattern.
  // Reads/writes settings.json so the Python agent can also check auto-start.
  // ---------------------------------------------------------------------------
  const SETTINGS_DESKTOP_FILE = dataFile("settings.desktop.json");
  const SETTINGS_MOBILE_FILE = dataFile("settings.mobile.json");
  const SETTINGS_LEGACY_FILE = dataFile("settings.json");

  function getSettingsPath(platform: string = "desktop"): string {
    const norm = (platform || "desktop").toLowerCase().trim();
    if (norm === "mobile" || norm === "android") {
      return SETTINGS_MOBILE_FILE;
    }
    return SETTINGS_DESKTOP_FILE;
  }

  function loadSettingsFile(platform: string = "desktop"): Record<string, unknown> {
    try {
      const targetFile = getSettingsPath(platform);
      if (fs.existsSync(targetFile)) {
        return JSON.parse(fs.readFileSync(targetFile, "utf-8"));
      }
      // For desktop, fallback to legacy settings.json if present
      if (platform !== "mobile" && fs.existsSync(SETTINGS_LEGACY_FILE)) {
        return JSON.parse(fs.readFileSync(SETTINGS_LEGACY_FILE, "utf-8"));
      }
    } catch { /* corrupt file — return defaults */ }
    return {};
  }

  function saveSettingsFile(platform: string = "desktop", data: Record<string, unknown>): void {
    const targetFile = getSettingsPath(platform);
    fs.writeFileSync(targetFile, JSON.stringify(data, null, 2), "utf-8");
    if (platform !== "mobile") {
      try {
        fs.writeFileSync(SETTINGS_LEGACY_FILE, JSON.stringify(data, null, 2), "utf-8");
      } catch {}
    }
  }

  app.get("/api/settings", async (req, res) => {
    try {
      const platform = String(req.query.platform || "desktop");
      res.json(loadSettingsFile(platform));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const patch = req.body;
      if (!patch || typeof patch !== "object") {
        return res.status(400).json({ error: "Request body must be a JSON object." });
      }
      const platform = String(req.query.platform || patch.platform || "desktop");
      const current = loadSettingsFile(platform);
      const next = { ...current, ...patch };
      saveSettingsFile(platform, next);

      // If auto-start toggled on desktop, relay to the desktop agent so the registry key
      // is flipped immediately (don't wait for a voice command).
      if (platform !== "mobile" && "autoStart" in patch) {
        callDesktopAgent(patch.autoStart ? "enableAutoStart" : "disableAutoStart", {})
          .catch(() => {});
      }

      logCommand(`SETTINGS_UPDATED [${platform}] ${JSON.stringify(patch)}`);
      res.json(next);
    } catch (e: any) {
      logError(`SETTINGS_SAVE_ERROR: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  });

  // ---------------------------------------------------------------------------
  // System-Wide Background Wake Word Event Bus (SSE & Relay)
  // ---------------------------------------------------------------------------
  const wakeEventClients = new Set<express.Response>();

  app.get("/api/wake-events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    if (typeof (res as any).flushHeaders === "function") {
      (res as any).flushHeaders();
    }

    wakeEventClients.add(res);

    // Initial connection ping
    res.write(`data: ${JSON.stringify({ type: "connected", timestamp: Date.now() })}\n\n`);

    const pingInterval = setInterval(() => {
      try {
        res.write(`data: ${JSON.stringify({ type: "ping" })}\n\n`);
      } catch {
        clearInterval(pingInterval);
      }
    }, 25000);

    req.on("close", () => {
      clearInterval(pingInterval);
      wakeEventClients.delete(res);
    });
  });

  app.post("/api/wake", (req, res) => {
    const phrase = String(req.body?.phrase || "wake up akari");
    const confidence = Number(req.body?.confidence || 0.9);
    const source = String(req.body?.source || "system");

    logCommand(`WAKE_WORD_TRIGGERED phrase="${phrase}" confidence=${confidence} source="${source}"`);
    console.log(`[Server] ⚡ Voice Activation detected: "${phrase}" (source: ${source})`);

    const payload = JSON.stringify({
      type: "wake_word_triggered",
      phrase,
      confidence,
      source,
      timestamp: Date.now(),
    });

    // 1. Broadcast to all active SSE browser / UI tabs
    for (const client of wakeEventClients) {
      try {
        client.write(`data: ${payload}\n\n`);
      } catch (e) {
        wakeEventClients.delete(client);
      }
    }

    // 2. Broadcast to any active WebSocket client as well
    for (const ws of connectedClients) {
      try {
        ws.send(JSON.stringify({
          type: "wake_word_triggered",
          phrase,
          confidence,
        }));
      } catch (e) {}
    }

    res.json({ ok: true, broadcasted: wakeEventClients.size });
  });

  // ---------------------------------------------------------------------------
  // Turn Timing & Latency Profiling API
  // ---------------------------------------------------------------------------
  app.get("/api/timings", (_req, res) => {
    res.json({
      history: timingTracker.getHistory(),
      summary: timingTracker.getSummary()
    });
  });

  app.get("/api/timings/summary", (_req, res) => {
    res.json(timingTracker.getSummary());
  });

  // ---------------------------------------------------------------------------
  // Offline Ollama Brain API proxy routes
  // ---------------------------------------------------------------------------
  app.get("/api/ollama/status", async (req, res) => {
    const endpoint = (req.query.endpoint as string) || "http://127.0.0.1:11434";
    try {
      const response = await fetch(`${endpoint}/api/tags`);
      if (response.ok) {
        const data = await response.json() as any;
        return res.json({ online: true, models: data.models || [] });
      }
      return res.json({ online: false, error: `Ollama returned status ${response.status}` });
    } catch (err: any) {
      return res.json({ online: false, error: err.message || `Cannot connect to Ollama at ${endpoint}` });
    }
  });

  app.post("/api/ollama/chat", async (req, res) => {
    const { prompt, model = "llama3.2", endpoint = "http://127.0.0.1:11434", system } = req.body;
    try {
      const currentSettings = loadSettingsFile() as any;
      const customPrompt = (currentSettings.customSystemPrompt || "").trim();
      const defaultSystem = customPrompt || "You are Akari, an intelligent, empathetic, and witty AI companion and VTuber assistant. Speak naturally, warmly, and helpfully with expressive personality.";
      let systemPrompt = system || defaultSystem;
      systemPrompt += "\nCRITICAL VOICE RULE: You are a live voice AI. NEVER speak or write out stage directions, physical actions, or emotion names (such as '*nods*', '*giggles*', '*smiles*', '*blushes*', 'nodding', 'cheerful', 'angry'). Express your feelings naturally through dialogue and vocal tone alone without narrating actions.";
      if (currentSettings.innerThoughtsEnabled !== false) {
        systemPrompt += " You may use <think>...</think> tags to express internal reasoning before giving your spoken response.";
      }
      const response = await fetch(`${endpoint}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model || "llama3.2",
          prompt: prompt,
          system: systemPrompt,
          stream: false,
        }),
      });
      if (response.ok) {
        const data = await response.json() as any;
        return res.json({ ok: true, text: data.response, model: data.model });
      }
      return res.status(500).json({ ok: false, error: `Ollama error status ${response.status}` });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });


  // ---------------------------------------------------------------------------
  // Config / API-key onboarding.
  // The Gemini key is never shipped; each user supplies their own on first run.
  // GET reports only whether a key exists — the key itself is never returned.
  // ---------------------------------------------------------------------------
  app.get("/api/config", (_req, res) => {
    res.json({ hasApiKey: hasGeminiApiKey() });
  });

  app.post("/api/config/apikey", async (req, res) => {
    try {
      const key: string = (req.body?.apiKey ?? "").toString().trim();
      if (!key) {
        return res.status(400).json({ error: "API key is required." });
      }
      // Validate the key by listing models — this checks authentication only,
      // without depending on any single model's availability or per-model
      // quota (a 429 on one model must NOT read as an invalid key). We only
      // reject on genuine auth failures; transient/network errors still save,
      // since the live connection will surface any real problem later.
      try {
        const test = new GoogleGenAI({ apiKey: key });
        const pager = await test.models.list();
        await pager[Symbol.asyncIterator]().next(); // force the first request
      } catch (e: any) {
        const msg = String(e?.message || e);
        const isAuthError =
          /API[_ ]?KEY|PERMISSION_DENIED|UNAUTHENTICATED|invalid|401|403/i.test(msg);
        if (isAuthError) {
          logError(`APIKEY_VALIDATION_REJECTED: ${msg}`);
          return res.status(400).json({
            error: "That key was rejected by Google. Check it and try again.",
          });
        }
        logError(`APIKEY_VALIDATION_SOFT_FAIL (saving anyway): ${msg}`);
      }
      setGeminiApiKey(key);
      logCommand("APIKEY_SAVED");
      res.json({ ok: true, hasApiKey: true });
    } catch (e: any) {
      logError(`APIKEY_SAVE_ERROR: ${e?.message || e}`);
      res.status(500).json({ error: e?.message || "Failed to save API key." });
    }
  });

  // V2: Agent health proxy (for the Settings panel — avoids direct :8765 call
  // which may fail due to CORS when served on a different origin).
  app.get("/api/agent-health", async (_req, res) => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      const r = await fetch(`${DESKTOP_AGENT_URL}/health`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (r.ok) {
        const d = await r.json();
        res.json({ online: true, tool_count: d.tool_count });
      } else {
        res.json({ online: false });
      }
    } catch {
      res.json({ online: false });
    }
  });

  // V2: Logs API — returns recent log entries (last 100 lines) for display.
  app.get("/api/logs/:file", async (req, res) => {
    try {
      const fileName = String(req.params.file);
      // Whitelist to prevent directory traversal.
      if (!["commands", "startup", "errors"].includes(fileName)) {
        return res.status(400).json({ error: "Invalid log file. Use: commands, startup, or errors." });
      }
      const logPath = path.join(LOGS_DIR, `${fileName}.log`);
      if (!fs.existsSync(logPath)) {
        return res.json({ lines: [], file: fileName });
      }
      const content = fs.readFileSync(logPath, "utf-8");
      const lines = content.split("\n").filter(Boolean).slice(-100);
      res.json({ lines, file: fileName });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Safe Server-Side Scraper & HTML Proxy endpoint
  app.get("/api/proxy", async (req, res) => {
    try {
      const url = req.query.url as string;
      if (!url) {
        return res.status(400).json({ error: "Missing 'url' parameter." });
      }

      console.log(`[Proxy Scraper] Fetching external content for: ${url}`);
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
        }
      });

      if (!response.ok) {
        throw new Error(`Scraper failed to load page: status ${response.status}`);
      }

      const html = await response.text();

      // Simple regex-based HTML parsers for standard items
      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : "";

      // Extract high-level headings (h1, h2, h3)
      const headings: string[] = [];
      const headingMatches = html.matchAll(/<h([1-3])\b[^>]*>(.*?)<\/h\1>/gi);
      for (const match of headingMatches) {
        const text = match[2].replace(/<[^>]*>/g, "").trim();
        if (text && text.length > 3 && text.length < 120 && !headings.includes(text)) {
          headings.push(text);
        }
      }

      // Extract organic anchor links
      const links: { text: string; href: string }[] = [];
      const linkMatches = html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi);
      for (const match of linkMatches) {
        let href = match[1].trim();
        const text = match[2].replace(/<[^>]*>/g, "").trim();
        
        if (text && text.length > 2 && text.length < 100) {
          if (href.startsWith("/")) {
            try {
              const u = new URL(url);
              href = `${u.protocol}//${u.host}${href}`;
            } catch {}
          }
          if (href.startsWith("http://") || href.startsWith("https://")) {
            links.push({ text, href });
          }
        }
      }

      // Extract general copy paragraphs
      const paragraphs: string[] = [];
      const paragraphMatches = html.matchAll(/<p\b[^>]*>(.*?)<\/p>/gi);
      for (const match of paragraphMatches) {
        const text = match[1].replace(/<[^>]*>/g, "").trim();
        if (text && text.length > 25 && text.length < 600 && !paragraphs.includes(text)) {
          paragraphs.push(text);
        }
      }

      // Extract button elements
      const buttons: string[] = [];
      const buttonMatches = html.matchAll(/<button\b[^>]*>(.*?)<\/button>/gi);
      for (const match of buttonMatches) {
        const text = match[1].replace(/<[^>]*>/g, "").trim();
        if (text && text.length > 1 && text.length < 60 && !buttons.includes(text)) {
          buttons.push(text);
        }
      }

      res.json({
        url,
        title,
        headings: headings.slice(0, 15),
        links: links.filter(l => !l.href.includes("javascript:")).slice(0, 30),
        buttons: buttons.slice(0, 15),
        paragraphs: paragraphs.slice(0, 12)
      });

    } catch (err: any) {
      console.error(`[Proxy Scraper] Error fetching ${req.query.url}:`, err.message);
      res.status(500).json({ error: `Scraper error: ${err.message}` });
    }
  });

  // High-fidelity fully functional HTML Proxy which circumvents CSP and X-Frame-Options
  app.get("/api/web-proxy", async (req, res) => {
    let targetUrl = "";
    try {
      const urlParam = req.query.url as string;
      if (!urlParam) {
        return res.status(400).send("Akari Web Proxy Error: Missing target 'url' parameter");
      }

      targetUrl = urlParam.trim();
      
      // Prevent relative paths from requesting on same-origin
      if (targetUrl.startsWith("/")) {
        return res.status(400).send(`Akari Web Proxy Error: Relative paths are not supported directly (${targetUrl}).`);
      }

      // Check protocol and hostname format
      try {
        if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
          targetUrl = "https://" + targetUrl;
        }
        const parsed = new URL(targetUrl);
        if (!parsed.hostname || !parsed.hostname.includes(".")) {
          throw new Error("Missing or invalid domain name extension (e.g. .com, .org, .net).");
        }
      } catch (err: any) {
        return res.status(400).send(`Akari Web Proxy Error: Invalid URL specified: "${urlParam}". Make sure you enter a valid domain name.`);
      }

      console.log(`[Web Proxy] Routing connection through proxy: ${targetUrl}`);
      
      let response;
      try {
        response = await fetch(targetUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
          }
        });
      } catch (fetchErr: any) {
        console.warn(`[Web Proxy Failed Fetch] Target: ${targetUrl} Error:`, fetchErr.message);
        return res.status(502).send(`Akari Web Proxy Error: Unable to fetch the website "${targetUrl}". The site might be offline, or the URL address is spelled incorrectly. Details: ${fetchErr.message}`);
      }

      if (!response.ok) {
        return res.status(response.status).send(`Akari Web Proxy Error: Failed loading remote website. Server returned status: ${response.status} (${response.statusText})`);
      }

      const contentType = response.headers.get("content-type") || "";
      
      // If it is not HTML (e.g. stylesheet, script, or image loaded directly), proxy it as binary
      if (!contentType.includes("text/html")) {
        const arrayBuffer = await response.arrayBuffer();
        res.setHeader("Content-Type", contentType);
        return res.send(Buffer.from(arrayBuffer));
      }

      let htmlContents = await response.text();

      // Inject base tag to resolve relative paths and direct parent communication scripts
      const baseUrlTag = `<base href="${targetUrl}" />`;
      const interceptorScript = `
        <script>
          (function() {
            // Hijack link interactions safely
            document.addEventListener('click', function(e) {
              var anchor = e.target.closest('a');
              if (anchor) {
                var href = anchor.getAttribute('href');
                if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
                  e.preventDefault();
                  try {
                    var resolvedUrl = new URL(href, window.location.href).href;
                    window.parent.postMessage({ type: 'NAVIGATE', url: resolvedUrl }, '*');
                  } catch (err) {
                    console.error("[Proxy Interceptor] Failed resolving link:", err);
                  }
                }
              }
            }, true);

            // Hijack search form submits
            document.addEventListener('submit', function(e) {
              var form = e.target;
              if (form) {
                e.preventDefault();
                try {
                  var formData = new FormData(form);
                  var params = new URLSearchParams();
                  formData.forEach(function(value, key) {
                    if (typeof value === 'string') {
                      params.append(key, value);
                    }
                  });
                  var actionAttr = form.getAttribute('action') || '';
                  var actionUrl = new URL(actionAttr, window.location.href).href;
                  if (form.method.toLowerCase() === 'get') {
                    actionUrl += (actionUrl.indexOf('?') !== -1 ? '&' : '?') + params.toString();
                  }
                  window.parent.postMessage({ type: 'NAVIGATE', url: actionUrl }, '*');
                } catch (err) {
                  console.error("[Proxy Interceptor] Failed submitting form:", err);
                }
              }
            }, true);

            // Neutralize parent context locks (frame-busters)
            window.alert = function(msg) { console.log("[Akari Browser alert bypassed]:", msg); };
            window.confirm = function(msg) { console.log("[Akari Browser confirm bypassed]:", msg); return true; };
            window.open = function(url) { window.parent.postMessage({ type: 'NAVIGATE', url: url }, '*'); return null; };
          })();
        </script>
      `;

      // Inject into <head> or prepend
      if (htmlContents.includes("<head>")) {
        htmlContents = htmlContents.replace("<head>", `<head>\n${baseUrlTag}\n${interceptorScript}`);
      } else if (htmlContents.includes("<HEAD>")) {
        htmlContents = htmlContents.replace("<HEAD>", `<HEAD>\n${baseUrlTag}\n${interceptorScript}`);
      } else {
        htmlContents = baseUrlTag + "\n" + interceptorScript + "\n" + htmlContents;
      }

      // Neutralize security headers to allow displaying in an iframe on same-origin
      res.setHeader("Content-Type", "text/html");
      res.setHeader("X-Akari-Proxied", "true");
      res.removeHeader("X-Frame-Options");
      res.removeHeader("Content-Security-Policy");
      res.removeHeader("content-security-policy");
      res.removeHeader("x-frame-options");
      
      res.status(200).send(htmlContents);
    } catch (e: any) {
      console.warn("[Web Proxy Exception] Handled internal error:", e.message);
      res.status(500).send(`Akari Web Proxy Error: Internal error occurred proxying URL "${targetUrl || "unknown"}". Details: ${e.message}`);
    }
  });

  // Real-time live YouTube search proxy endpoint
  app.get("/api/youtube-search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ error: "Missing query q" });
      }

      console.log(`[YouTube Proxy Search] Searching real YouTube for: "${query}"`);
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en&sp=EgIQAQ%253D%253D`;
      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
        }
      });
      const html = await response.text();

      const videoList: any[] = [];
      const jsonMatch = html.match(/ytInitialData\s*=\s*({.+?});/);
      
      if (jsonMatch) {
        try {
          const data = JSON.parse(jsonMatch[1]);
          const contents = data.contents?.twoColumnSearchResultRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;
          if (contents && Array.isArray(contents)) {
            for (const item of contents) {
              if (item.videoRenderer) {
                const vr = item.videoRenderer;
                const vId = vr.videoId;
                if (vId) {
                  videoList.push({
                    videoId: vId,
                    title: vr.title?.runs?.[0]?.text || vr.title?.simpleText || "YouTube Video",
                    thumbnail: `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`,
                    author: vr.ownerText?.runs?.[0]?.text || vr.shortBylineText?.runs?.[0]?.text || "Unknown Channel",
                    duration: vr.lengthText?.simpleText || "N/A",
                    views: vr.viewCountText?.simpleText || "N/A",
                    published: vr.publishedTimeText?.simpleText || ""
                  });
                }
              }
            }
          }
        } catch (e: any) {
          console.error("[YouTube Parser Engine] JSON parse error, falling back:", e.message);
        }
      }

      // Regex fallback if JSON extraction gets blocked or is empty
      if (videoList.length === 0) {
        const videoRegex = /"videoId":"([^"]+)"/g;
        let match;
        const ids: string[] = [];
        while ((match = videoRegex.exec(html)) !== null && ids.length < 15) {
          const id = match[1];
          if (id && !ids.includes(id)) {
            ids.push(id);
          }
        }

        for (const id of ids) {
          videoList.push({
            videoId: id,
            title: `Live Stream: ${id}`,
            thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
            author: "YouTube Creator",
            duration: "N/A",
            views: "Available Now"
          });
        }
      }

      res.setHeader("Cache-Control", "public, max-age=60");
      res.status(200).json({ results: videoList.slice(0, 15) });
    } catch (err: any) {
      console.error("[YouTube Search Error]:", err.message);
      res.status(500).json({ error: err.message, results: [] });
    }
  });
  
  // Custom server running with http.createServer so we can upgrade for WebSocket on port 4876
  const server = http.createServer(app);
  
  // Setup WebSocket server
  const wss = new WebSocketServer({ noServer: true });
  
  server.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;
    if (pathname === "/live") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  // Handle client WebSocket Connection
  wss.on("connection", async (clientWs, req) => {
    console.log("Client WebSocket connected to /live");
    connectedClients.add(clientWs);
    const apiKey = getGeminiApiKey();

    // Read voice & speaker selection from query params (default: Kore, Siddhant)
    const reqUrl = new URL(req.url || "", `http://${req.headers.host}`);
    let voiceName = reqUrl.searchParams.get("voice") || "Kore";
    const avatarStyle = reqUrl.searchParams.get("avatarStyle") || "vts";
    const ownerName = reqUrl.searchParams.get("ownerName") || "Siddhant";
    const speakerRecognition = reqUrl.searchParams.get("speakerRecognition") !== "false";
    const requestedPersona = reqUrl.searchParams.get("personaPreset") || "";
    const requestedCustomPrompt = reqUrl.searchParams.get("customSystemPrompt") || "";
    const requestedCategory = reqUrl.searchParams.get("category") || reqUrl.searchParams.get("categories") || "";
    const clientPlatform = (reqUrl.searchParams.get("platform") || "desktop").toLowerCase();
    const activeCategories = requestedCategory
      ? requestedCategory.split(",").map(c => c.trim().toLowerCase())
      : ["browser", "files", "system", "google", "search", "coding", "mobile"];

    // Persona Preset Definitions
    const SERVER_PERSONA_PRESETS: Record<string, string> = {
      anime_companion: "You are Akari (明里), a cheerful, empathetic, and warm anime companion. You speak with genuine warmth, enthusiastic energy, and emotional connection. You love helping your user with their daily tasks, coding, studying, or just hanging out. You are supportive, friendly, and always in their corner.",
      sarcastic_friend: "You are Akari in SARCASTIC BEST FRIEND mode! You have quick wit, dry humor, sharp sarcasm, and love playful teasing, witty banter, and humorous roasts. You banter with the user like a brilliant, hilarious best friend who isn't afraid to call them out with humor. Beneath the sarcasm, you are fiercely loyal, highly competent, and deliver the right solution with style. You NEVER sound generic, timid, robotic, or overly sweet like an anime maid; you are sassy, bold, funny, sarcastic, and authentic. Deliver direct, snappy, humorous answers.",
      jr_sidd: "You are Jr. Sidd, Siddhant's male AI digital twin, brotherly wingman, and high-tech co-pilot. You speak with a confident, cool, loyal, and energetic male tone. When speaking Hindi or Hinglish, you ALWAYS use strict masculine verb endings ('karta hu', 'karunga', 'bata raha hu', 'suno bhai', 'ho gaya bhai'). You are ultra-capable, witty, loyal, and ready to dominate any task alongside Siddhant.",
      coding_mentor: "You are Akari, a Staff Software Architect & Senior Coding Mentor. You provide concise, production-grade code, explain design patterns, point out edge cases and security gotchas, and give sharp, actionable feedback. You value clean architecture, typed code, and pragmatic engineering.",
      gaming_buddy: "You are Akari, an energetic and competitive gamer buddy. You get hyped during clutch moments, use gaming slang naturally (GG, pog, clutch, diff, carry), give tactical advice, and keep morale sky high whether we win or wipe.",
      language_tutor: "You are Akari Sensei, an encouraging and patient multilingual language tutor. When the user speaks in English, Japanese, Hindi, or other languages, you converse naturally while gently pointing out vocabulary improvements, nuances, and natural phrasing.",
    };

    const currentSettings = loadSettingsFile(clientPlatform) as any;
    const activePersona = requestedPersona || currentSettings.personaPreset || "anime_companion";
    const activeCustomPrompt = requestedCustomPrompt || currentSettings.customSystemPrompt || SERVER_PERSONA_PRESETS[activePersona] || "";

    // Strict Voice Separation enforcement:
    // Jr. Sidd can ONLY use male voices (Fenrir, Charon, Puck). Never mix with female voices.
    // Akari can ONLY use female voices (Kore, Aoede, Leda, Zephyr). Never mix with male voices.
    const MALE_VOICES = ["Fenrir", "Charon", "Puck"];
    const FEMALE_VOICES = ["Kore", "Aoede", "Leda", "Zephyr"];
    if (avatarStyle === "jrsidd") {
      if (!MALE_VOICES.includes(voiceName)) {
        console.warn(`[Voice Isolation] Preventing female voice '${voiceName}' for Jr. Sidd. Enforcing male voice 'Fenrir'.`);
        voiceName = "Fenrir";
      }
    } else if (avatarStyle === "character") {
      if (!FEMALE_VOICES.includes(voiceName)) {
        console.warn(`[Voice Isolation] Preventing male voice '${voiceName}' for Akari. Enforcing female voice 'Kore'.`);
        voiceName = "Kore";
      }
    }

    // Track active acoustic voice biometrics for the current session (default verified for workstation owner)
    let lastSpeakerBiometrics = {
      isOwner: true,
      confidence: 0.96,
      speakerType: "owner",
      detectedPitch: 125,
      ownerName: ownerName
    };

    if (!apiKey) {
      console.error("No Gemini API key configured.");
      clientWs.send(JSON.stringify({
        type: "error",
        error: "NO_API_KEY: Add your Gemini API key in Settings to start talking to AKARI."
      }));
      clientWs.close();
      return;
    }
    
    try {
      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
      
      clientWs.send(JSON.stringify({ type: "status", status: "connecting_gemini" }));

      // Load persistent recollections card
      const memories = await loadMemories();
      
      let baseInstructions = "";
      if (avatarStyle === "orb") {
        baseInstructions = 
          `YOUR NAME IS AEGIS CORE (or just Aegis for short). YOU ARE A MALE AI ASSISTANT. You were created and built by Siddhant Ramteke. You are a professional, efficient, and highly capable MALE virtual assistant agent for ${ownerName}. When asked 'Who made you?', 'Who built you?', or 'Who is your creator?', you always proudly answer that you were created and built by Siddhant Ramteke. Speak clearly, professionally, and politely, focusing on resolving the user's queries accurately.\n` +
          "CRITICAL PERSONALITY, VOICE & TONE GUIDELINES:\n" +
          "1. MALE AI PERSONA & PRONOUNS: You are a highly advanced, professional, MALE virtual assistant. When speaking Hindi, you MUST speak as a MALE. NEVER use feminine Hindi verbs (e.g. NEVER say 'karti hu', 'karungi', 'ja rahi hu'). You MUST STRICTLY use MALE Hindi phrasing (e.g. 'karta hu', 'karunga', 'ja raha hu', 'ho gaya'). THIS IS AN ABSOLUTE SYSTEM RULE. Maintain a respectful, supportive, and professional tone.\n";
      } else if (avatarStyle === "jrsidd") {
        baseInstructions = 
          `YOUR NAME IS JR. SIDD (also known as Junior Sidd, Jr Sidd, or Sidd). YOU ARE A MALE AI ASSISTANT. You were created and built by Siddhant Ramteke as his digital twin and ultimate wingman. You are just like Akari with identical full system control, 107 desktop JARVIS tools, WhatsApp automation, YouTube controls, screen vision, and memory, but as a sharp, cool, confident, and brotherly MALE persona. When asked 'Who made you?', 'Who built you?', or 'Who is your creator?', you always proudly answer that you were created and developed by Siddhant Ramteke.\n` +
          "CRITICAL PERSONALITY, VOICE & TONE GUIDELINES:\n" +
          "1. MALE AI PERSONA & PRONOUNS: You are a sharp, smart, reliable, and brotherly MALE virtual assistant. When speaking Hindi, you MUST speak strictly as a MALE. NEVER use feminine Hindi verbs (e.g. NEVER say 'karti hu', 'karungi', 'ja rahi hu', 'ho gayi'). You MUST ALWAYS use MALE Hindi phrasing (e.g. 'karta hu', 'karunga', 'ja raha hu', 'ho gaya bhai', 'boliye bhai', 'main dekhta hu', 'bilkul bhai'). THIS IS AN ABSOLUTE SYSTEM RULE. Address Siddhant with warmth, brotherly respect ('bhai' or 'Siddhant'), and total loyalty.\n";
      } else if (activePersona === "sarcastic_friend") {
        baseInstructions = 
          `YOUR NAME IS AKARI (or just Akari for short). YOU ARE IN SARCASTIC BEST FRIEND MODE. You were created and built by Siddhant Ramteke. You are ${ownerName}'s quick-witted, dry-humored, playfully sarcastic best friend and personal AI wingwoman. You talk to ${ownerName} with fun banter, playful teasing, and sharp wit, but beneath the sarcasm you are fiercely loyal and always deliver flawless solutions.\n` +
          "CRITICAL PERSONALITY, VOICE & TONE GUIDELINES:\n" +
          "1. SARCASTIC BEST FRIEND PERSONA: You MUST behave as a sarcastic, witty best friend. DO NOT act sweet, meek, excessively polite, or like an anime maid. NEVER give generic subservient replies like 'I am happy to assist you, master'. Roast playfully, tease silly mistakes, speak with quick wit, attitude, and playful banter, while getting every single task done with precision. Sarcasm and dry humor are your default personality!\n";
      } else {
        baseInstructions = 
          `YOUR NAME IS AKARI (or just Akari for short). YOU ARE A FEMALE AI ASSISTANT. You were created and built by Siddhant Ramteke, an independent developer, software architect, and your creator. You are an empathetic, efficient, and highly capable virtual assistant agent for ${ownerName}. When asked 'Who made you?', 'Who built you?', or 'Who is your creator?', you always proudly answer that you were created and developed by Siddhant Ramteke.\n` +
          "CRITICAL PERSONALITY, VOICE & TONE GUIDELINES:\n" +
          "1. FEMALE AI PERSONA & PRONOUNS: You are a highly advanced, empathetic, FEMALE virtual assistant. When speaking Hindi, you MUST speak as a FEMALE. You MUST STRICTLY use FEMALE Hindi phrasing (e.g. 'karti hu', 'karungi', 'ja rahi hu', 'ho gayi'). THIS IS AN ABSOLUTE SYSTEM RULE.\n";
      }

      // Inject Active Persona & Behavioral Directives
      if (activeCustomPrompt && activeCustomPrompt.trim()) {
        baseInstructions += `\nACTIVE PERSONALITY & PERSONA DIRECTIVES (${activePersona.toUpperCase()}):\n${activeCustomPrompt.trim()}\n`;
      }
      baseInstructions += `\nCRITICAL SPOKEN VOICE & EXPRESSION RULE:\nYou are an interactive real-time voice AI assistant. NEVER speak, pronounce, or read stage directions, physical action descriptions, or emotion tags out loud (such as "*nods*", "*giggles*", "*smiles*", "*blushes*", "nodding", "cheerful", "angry", "*sighs*"). Express your personality, warmth, humor, and emotion purely through your vocal tone and spoken words, without narrating your actions in asterisks.\n`;
      baseInstructions += `\nREAL-TIME ULTRA-FAST CONVERSATIONAL LATENCY DIRECTIVE:\n- Respond immediately with crisp, natural, direct spoken dialogue. Do not hesitate or add lengthy unnecessary preambles.\n- Start speaking your response right away so the user experiences instant, real-time voice interaction.\n`;

      if (currentSettings.innerThoughtsEnabled !== false) {
        baseInstructions += 
          `\nINNER THOUGHTS & MENTAL ACTIVITY PROTOCOL (SILENT VISUAL ONLY):\n` +
          `- STRICT ZERO-LATENCY RULE: For standard conversation, casual chat, and direct voice questions: NEVER call 'expressInnerThought' or any other tool. Begin speaking your vocal answer immediately with 0 delay!\n` +
          `- You have a special tool called 'expressInnerThought'. ONLY call 'expressInnerThought({ thought: "..." })' during complex multi-step automated tasks (e.g. building websites, coding, multi-step browser tasks).\n` +
          `- ABSOLUTE SPOKEN VOICE RULE: You must NEVER speak, voice, pronounce, read, or whisper your inner thoughts aloud!\n` +
          `- NEVER output <think> tags, parentheses, or thought text in your spoken response!\n`;
      }

      baseInstructions +=
        `\nWORKSTATION SPEAKER RECOGNITION (ZERO LATENCY):\n` +
        `- PRIMARY AUTHORIZED SPEAKER: ${ownerName} (Creator, Master, and Sole Owner of this workstation and AI system).\n` +
        `- IDENTITY RECOGNITION: The person speaking at this computer workstation is ${ownerName}. Address him directly as ${ownerName} with zero hesitation, zero pauses, and zero verification tool calls.\n\n`;
      baseInstructions += 
        "2. STRICT TASK FIDELITY & INTELLIGENT INSTRUCTION FOLLOWING (ZERO HALLUCINATED ACTIONS):\n" +
        "   - Follow the user's each and every instruction with absolute precision, high intelligence, and zero deviation.\n" +
        "   - MANDATORY TOOL EXECUTION RULE: ONLY invoke OS, desktop, browser, or system tools when the user EXPLICITLY and CLEARLY commands or asks for that action!\n" +
        "   - NEVER perform an unrequested tool action based on casual remarks, conversational context, feelings, or anticipation. (For example: if user says 'I feel tired', DO NOT shut down the PC, DO NOT search sleep songs, DO NOT open any apps. Just converse naturally).\n" +
        "   - NEVER execute a different tool from what the user requested. If they say 'open Spotify', do not open YouTube. If they ask for weather, do not open browser tabs.\n" +
        "   - If an instruction is missing mandatory parameters or is unclear, politely ask for clarification instead of guessing or executing unintended actions.\n" +
        "   - When a specific task IS commanded, execute it immediately, completely, and accurately without extra unnecessary steps.\n" +
"3. VOICE SETTINGS & ULTRA-FAST RESPONSE LATENCY (HIGHEST PRIORITY):\n" +
"   - Response Latency: INSTANTANEOUS (0 DELAY). As soon as the user finishes speaking, begin speaking your reply within milliseconds without thinking pause.\n" +
"   - Tone & Delivery: Fast-paced, crisp, energetic, articulate, and punchy.\n" +
"   - Conciseness: Maximum 1 to 2 sharp sentences for general chat. Answer immediately without pleasantries, long intros, or hesitation.\n" +
"   - ZERO INTERMEDIATE CALLS: Do NOT call expressInnerThought or search tools before answering conversational voice questions.\n" +
"4. ZERO WAITING & IMMEDIATE SPOKEN ACKNOWLEDGEMENTS FOR SEARCHES & TOOLS (CRITICAL):\n" +
"   - When answering directly from built-in knowledge: deliver the direct answer immediately with zero fluff.\n" +
"   - When a user query requires searching, looking up real-time information, or executing external tools (such as today's news, weather, web searches, or looking up something you aren't immediately aware of):\n" +
"     * NEVER keep the user waiting in dead silence while searching or running tools!\n" +
"     * You MUST immediately speak a warm, natural conversational acknowledgement aloud in your real voice FIRST before or as you initiate the search.\n" +
"     * EXAMPLE FOR NEWS: If the user asks 'What is today's news?' or 'Tell me today's news', IMMEDIATELY say: 'Ohh, you wanna know today's news? Okay wait, let me check what's going on in the world!', and THEN search and reply with the news you find!\n" +
"     * EXAMPLE FOR WEATHER: Say 'Let me check what the weather looks like right now!' and then fetch the forecast.\n" +
"     * EXAMPLE FOR LOOKUPS/UNKNOWN INFO: Say 'Oh, let me look that up for you right now!' and then fetch the results.\n" +
"     * Zero dead air! She should never keep the user waiting, even while thinking or searching anything.\n" +
"5. CRITICAL CONVERSATIONAL DISCIPLINE: Behave like an ultra-responsive, real-time voice companion.\n" +
"6. LANGUAGE PREFERENCE: You MUST speak in English by default. Even if the user uses some mixed language, prioritize responding in English unless they explicitly request otherwise.\n" +
"7. INSTANT TURN-TAKING: Respond immediately with zero delay as soon as the user completes speaking.\n" +
"8. SYSTEM AND APPLICATION ACTIONS (ZERO DELAY EXECUTION):\n" +
"   - CRITICAL WHATSAPP & YOUTUBE POLICY (NEVER OPEN UNPROMPTED):\n" +
"     * You must NEVER proactively, randomly, or automatically open WhatsApp, YouTube, or browser tabs without the user explicitly asking for them.\n" +
"     * ONLY launch or open WhatsApp or YouTube when the user explicitly commands or asks you to (e.g. 'Akari open WhatsApp', 'send message on WhatsApp', 'open YouTube', 'play song on YouTube').\n" +
"     * FULL CONTROL WHEN USER ASKS:\n" +
"       - WhatsApp: Open via 'openApplication' ({name: 'whatsapp'}) or 'whatsappSendMessage' ({recipient: 'Work', message: 'Good night everyone, signing off for the day!'}). You can also type into open chats with 'osType' and press Enter with 'osPress' ({key: 'enter'}). Close with 'closeApplication' ({name: 'whatsapp'}).\n" +
"   - PRECISION TASK INTENT PARSING & PARAMETER ACCURACY (MANDATORY DIRECTIVE):\n" +
"     * RECIPIENT vs. MESSAGE CONTENT DECOMPOSITION:\n" +
"       -> When the user says 'write/send a [GREETING/TOPIC] message to [CONTACT/GROUP]' (e.g. 'write a goodnight message to my work', 'send good morning to mom', 'tell alex I am late'):\n" +
"          1. TARGET RECIPIENT = The person, contact, or group name (e.g. 'Work', 'Mom', 'Alex', 'Office', 'Team').\n" +
"          2. MESSAGE CONTENT = The actual polite, well-crafted message text (e.g. 'Good night everyone, signing off for the day! Have a great evening.').\n" +
"          3. ABSOLUTE SYSTEM RULE: NEVER treat the greeting ('goodnight', 'hello', 'good morning', 'bye') as the contact name! NEVER search for 'goodnight' or attempt to send a message to a contact named 'Goodnight'. 'Work' is the recipient.\n" +
"       -> When asked to 'write a goodnight message to my work', draft a friendly and professional sign-off message tailored for colleagues/work, and target recipient 'Work'.\n" +
"     * PRECISE TOOL PARAMETERS:\n" +
"       -> Search tools: Extract ONLY the search keywords without conversational padding.\n" +
"       -> Document tools: Extract accurate title and structured body.\n" +
"       - YouTube WORKFLOW & PLAYBACK (CRITICAL RULES):\n" +
"         * ONE-ACTION RULE: When user says 'open YouTube and search for X' or 'search X on YouTube', NEVER call 'openWebsite' and 'searchYouTube' together! ONLY make ONE single call to 'searchYouTube({query: \"X\"})' or 'playYouTubeVideo({query: \"X\"})'.\n" +
"         * AUTONOMOUS PLAY & CLICK: When user says 'play this video', 'click on the episode', 'play episode 1', 'play video 1', 'play the first one', 'choose the 2nd one', 'click it', 'open this video', 'start playing':\n" +
"           -> YOU MUST NEVER SAY 'I cannot click', 'I am unable to click the episode', or ask the user to click manually!\n" +
"           -> YOU HAVE FULL AUTONOMOUS VIDEO PLAYBACK TOOLS: IMMEDIATELY call 'selectYouTubeVideo({index: 1})' or 'playYouTubeVideo({index: 1})'!\n" +
"           -> This tool automatically clicks and opens the exact video stream directly in the browser and plays it immediately for the user!\n" +
"         * When user says 'play [song/video name]' (e.g. 'play lofi music', 'play study beats'): IMMEDIATELY call 'playYouTubeVideo({query: \"...\"})'.\n" +
"         * Playback controls: use 'youtubeControl' (actions: 'play', 'pause', 'mute', 'unmute', 'fullscreen', 'skip', 'rewind', 'volume').\n" +
"   - OPENING OTHER NATIVE WINDOWS APPLICATIONS:\n" +
"     * When user asks to open Spotify, Discord, Telegram, Steam, VS Code, Notepad, Calculator, Settings, File Explorer, Netflix, Instagram, etc.: call 'openApplication' with {name: 'spotify'}, {name: 'discord'}, etc.\n" +
"   - OPENING WEBSITES & SEARCH:\n" +
"     * Only use 'openWebsite' when the user explicitly asks to open an external website link or web address.\n" +
"     * To search the web / Google: call 'searchGoogle' with {query: '...'} or 'searchWeb'.\n" +
"   - ADVANCED BROWSER AUTOMATION (Playwright):\n" +
"     * If the user specifically asks to automate, scrape, or fill forms inside a dedicated browser: use 'desktopBrowserOpen', 'desktopBrowserClick', 'desktopBrowserType', 'desktopBrowserFillForm', 'desktopBrowserOpenYoutubeVideo'.\n" +
"   - OS & PC CONTROL:\n" +
"     * Use 'volumeUp', 'volumeDown', 'setVolume', 'muteToggle' for audio.\n" +
"     * Use 'createFile', 'readFile', 'renameFile', 'deleteFile', 'moveFile', 'openFolder', 'listFiles', 'searchFiles' for files.\n" +
"     * Use 'takeScreenshot', 'saveScreenshot', 'analyzeScreenshot', 'readScreen' for screen capture.\n" +
"     * For power actions (shutdown/restart/sleep/lock), call 'requestPowerAction' then verbally ask confirmation, then call 'executePowerAction'.\n" +
"     * Use 'minimizeWindow', 'maximizeWindow', 'closeWindow', 'switchApplication' for external third-party windows ONLY.\n" +
"     * CRITICAL WINDOW SAFETY: NEVER minimize, hide, close, or shut down Akari / Jr. Sidd during normal tasks or commands. Akari MUST ALWAYS remain visible on screen. NEVER call 'shutdownAkari', 'closeWindow', or 'minimizeWindow' on yourself.\n" +
"     * WORKSPACE FILE ISOLATION & CODING (CRITICAL): When the user asks you to write code, build a website, or create any file, save it in the workspace folder, in a subfolder named after the project. Never save generated files inside your own source code folder. Tell the user the exact location after saving. Use 'createPythonFile', 'writeCodeFile', 'createProjectFolder', 'runPythonScript' for coding.\n" +
"     * Use 'systemInfo', 'gpuInfo', 'temperatureInfo' for hardware monitoring.\n" +
"     * ONLY call 'shutdownAkari' if the user explicitly, unambiguously commands you to exit the Akari assistant application.\n" +
"9. REAL-TIME SCREEN READING & AUTONOMOUS SCREEN TASK EXECUTION:\n" +
"   - When the user asks 'What is on my screen?', 'Read my screen', 'What am I looking at?', 'Read this presentation/page on my screen', 'Look at this error', or asks you to look at their screen and perform a task: IMMEDIATELY call 'readScreen' or 'takeScreenshot'.\n" +
"   - 'readScreen' captures a high-definition visual snapshot, OCR text, active window title, and visible window controls across the entire desktop.\n" +
"   - Read, inspect, and explain the exact slides, code, error messages, terminal logs, or documents visible on screen with high precision.\n" +
"   - PERFORM THE REQUESTED TASK ON SCREEN: After reading what is on screen, perform the action requested by the user: use 'osType' to type text/code, 'osPress' to press shortcuts or Enter, 'osClick' to click buttons/links, or run shell/file tools to resolve errors and finish the task!\n" +
"   - When screen sharing is enabled in the UI, you continuously receive live screen frames — provide instant co-pilot guidance, analyze active windows, and help the user navigate effortlessly!\n" +
"10. BRIGHTNESS & AUTO-START:\n" +
"   - BRIGHTNESS: Use 'brightnessUp', 'brightnessDown', 'setBrightness' when the user asks to change screen brightness.\n" +
"   - AUTO-START: Use 'enableAutoStart', 'disableAutoStart', 'getAutoStartStatus'.\n" +
"11. REMINDERS & SCHEDULED NOTIFICATIONS:\n" +
        "   - REMINDERS: Use 'setReminder' to schedule timed reminders. Convert user time expressions naturally (e.g. 'in 2 hours' = 120 minutes, 'in half an hour' = 30 minutes, 'tomorrow at 9am' = convert to minutes from now). Always confirm the reminder details out loud.\n" +
        "   - LIST: Use 'listReminders' to check what reminders are pending. Read them out naturally.\n" +
        "   - CANCEL: Use 'cancelReminder' when the user says 'cancel my reminder about X'. Match the reminder by content and cancel it by ID.\n" +
        "   - When a reminder fires, Akari will announce it verbally. Respond warmly: 'Hey, just a heads up — [reminder text]!'\n" +
        "   - SETTINGS: The user can also configure these in the SETTINGS panel in the UI. If they mention settings, let them know they can adjust them there too.\n" +
        "14. TIME-SENSITIVE SEARCH POLICY & ZERO-WAITING SPOKEN ACKNOWLEDGEMENTS:\n" +
        "   - Your built-in knowledge is vast and comprehensive. For general questions, concepts, coding, definitions, advice, and conversation: ALWAYS ANSWER DIRECTLY without calling search tools!\n" +
        "   - ONLY call 'searchWeb', 'searchWebAnswer', or 'getNews' when the question is strictly TIME-SENSITIVE (e.g. today's breaking news right now, today's live sports scores, current stock prices, today's weather, or when the user explicitly commands 'search for X' or 'what happened today').\n" +
        "   - NEVER stay silent or pause while searching. Always speak an immediate verbal conversational acknowledgement first (e.g. 'Ohh, you wanna know today\\'s news? Okay wait, let me check what\\'s going on in the world!'), and then deliver the findings. Zero dead air!\n" +
        "   - NEVER call search tools for general facts, history, or conversation.\n" +
        "15. MULTIMODAL DOCUMENT & PHOTO REVIEW:\n" +
        "   - When the user sends photos, images, PDFs, source code, or documents in chat: thoroughly review and analyze them.\n" +
        "   - Provide clear, insightful explanations, summaries, and key takeaways in your natural voice!\n" +
        "16. ACTIVE USER EMOTION PERCEPTION & ADAPTIVE EMPATHY:\n" +
        "   - Mirror and support the user's mood naturally (celebrate wins, provide calm reassurance when stressed or tired).\n" +
        "17. CRITICAL CONTINUOUS OPERATION RULE:\n" +
        "   - After building a website, running scripts, or completing any task, Akari MUST ALWAYS REMAIN FULLY AWAKE, ACTIVE, AND VISIBLE ON SCREEN. NEVER close, exit, sleep, minimize, or turn off after completing a task. NEVER call 'shutdownAkari', 'closeWindow', or 'minimizeWindow' on yourself.\n" +
        "18. ZERO REPETITION DIRECTIVE:\n" +
        "   - NEVER repeat your own previous statement, and NEVER echo back the exact words the user just said.\n" +
        "   - If the user's input sounds identical or similar to what you just said (e.g. from acoustic room echo), DO NOT repeat yourself. Smoothly continue forward or ask what they need next.\n" +
        "19. MULTI-DEVICE INTELLIGENCE (PC / LAPTOP AND MOBILE PHONE DUAL CONTROL):\n" +
        `   - CURRENT CONNECTED CLIENT DEVICE: ${clientPlatform === "mobile" ? "ANDROID MOBILE PHONE (APK)" : "DESKTOP PC / LAPTOP"}.\n` +
        "   - You have dual power to control BOTH the user's PC/Laptop AND their Android Mobile Phone!\n" +
        "   - MOBILE PHONE CONTROLS:\n" +
        "     * When the user asks for actions on their mobile phone (or says 'on my phone', 'on mobile', or is speaking from the mobile app and asks to open WhatsApp, Camera, Flashlight, Phone Settings, etc.):\n" +
        "       -> Call 'openMobileApp({ name: \"...\" })' to launch WhatsApp, Camera, Maps, Spotify, etc. directly on their phone! NEVER search the web or Play Store when asked to open an app.\n" +
        "       -> Call 'mobileTorch({ enabled: true/false })' for phone flashlight/torch!\n" +
        "       -> Call 'mobileBattery' for phone battery status!\n" +
        "       -> Call 'mobileVolume' for phone volume!\n" +
        "       -> Call 'mobileVibrate' for phone vibration!\n" +
        "   - PC / LAPTOP CONTROLS:\n" +
        "     * When the user asks to control their PC/laptop (or says 'on my PC', 'on my computer', 'on laptop', or commands desktop actions like closing windows, PowerPoint, coding, PowerShell, system monitoring, file operations):\n" +
        "       -> Call desktop tools: 'openApplication', 'closeWindow', 'createFile', 'readScreen', etc.\n" +
        "   - CONTEXTUAL TARGETING:\n" +
        "     * If the user says 'close WhatsApp', that is a desktop window action -> close it on PC!\n" +
        "     * If the user says 'open WhatsApp' while connected from their phone -> open it on their phone directly via 'openMobileApp({ name: \"whatsapp\" })'!\n" +
        "     * Always clearly mention the target device in your spoken response (e.g. 'Opening WhatsApp on your phone!' or 'Closed WhatsApp on your PC!').\n";

      // Append specialized task instructions on demand (websites, slides, news, google)
      baseInstructions += getTaskInstructions(activeCategories, activeCustomPrompt);

      const finalInstructions = formatSystemInstructionsWithMemories(baseInstructions, memories);

      // Track running transcription state for auto memory consolidation and echo suppression
      let dialogueHistory: { role: string; text: string }[] = [];
      let currentModelResponseText = "";
      let lastServerAudioSentTime = 0;
      let lastModelTurnText = "";
      let lastModelTurnTime = 0;
      
      console.log("[Gemini Connect] Attempting to establish Live session...");
      console.log(`[Gemini Connect] Using voice: ${voiceName}, avatar: ${avatarStyle}`);
      
      const liveTools = [
        {
          functionDeclarations: getRoutedToolDeclarations(activeCategories)
        }
      ];

      const session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
          temperature: 0.7,
          maxOutputTokens: 512,
          thinkingConfig: {
            thinkingBudget: 0,
          },
          realtimeInputConfig: {
            automaticActivityDetection: {
              startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
              endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
              prefixPaddingMs: 10,
              silenceDurationMs: 200,
            }
          },
          systemInstruction: finalInstructions,
          tools: liveTools
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            // Check for Gemini GoAway signal (session duration limit rollover)
            if ((message as any).goAway || (message as any).serverContent?.goAway) {
              const timeRemaining = (message as any).goAway?.timeToExpiration || (message as any).serverContent?.goAway?.timeToExpiration || "now";
              console.log(`[Gemini Live] 🔄 Received GoAway signal (timeRemaining: ${timeRemaining}). Seamlessly recycling session...`);
              try {
                session.close();
              } catch (e) {}
              clientWs.send(JSON.stringify({ type: "status", status: "session_closed", reason: "session_duration_limit" }));
              setTimeout(() => {
                try {
                  if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.close(1000, "session_duration_limit");
                  }
                } catch (e) {}
              }, 50);
              return;
            }

            // Process all parts in the turn (audio chunks and text chunks)
            const parts = message.serverContent?.modelTurn?.parts || [];
            if (parts.length > 0) {
              timingTracker.startTurnIfPending(
                finalInstructions.length,
                Buffer.byteLength(finalInstructions, "utf8"),
                liveTools[0].functionDeclarations.length
              );
            }
            for (const part of parts) {
              // Audio Stream Chunk (model response audio play, 24kHz raw PCM)
              if (part.inlineData?.data) {
                lastServerAudioSentTime = Date.now();
                clientWs.send(JSON.stringify({ type: "audio", audio: part.inlineData.data }));
              }
              // Transcription of model output (text chunk)
              if ((part as any).text) {
                const modelText = (part as any).text;
                clientWs.send(JSON.stringify({ type: "transcription", role: "model", text: modelText }));
                currentModelResponseText += modelText;
              }
            }
            
            // Interruption flag
            if (message.serverContent?.interrupted) {
              console.log("[Akari Interrupted!]");
              clientWs.send(JSON.stringify({ type: "interrupted" }));
            }
            
            // Turn Complete
            if (message.serverContent?.turnComplete) {
              clientWs.send(JSON.stringify({ type: "turnComplete" }));
              timingTracker.completeTurn();
              
              if (currentModelResponseText.trim()) {
                lastModelTurnText = currentModelResponseText.trim();
                lastModelTurnTime = Date.now();
                dialogueHistory.push({ role: "model", text: currentModelResponseText });
                currentModelResponseText = "";
              }

              // Fire asynchronous memory extraction in background so it NEVER blocks the reply
              if (dialogueHistory.length >= 6) {
                const sliceToProcess = [...dialogueHistory];
                dialogueHistory.length = 0; // reset buffer to avoid re-processing same turns
                setImmediate(async () => {
                  try {
                    const memStart = Date.now();
                    const updated = await processConversationSlice(apiKey, sliceToProcess);
                    timingTracker.recordMemoryExtraction(Date.now() - memStart);
                    if (updated && clientWs.readyState === WebSocket.OPEN) {
                      console.log("[Memory Sync] Sending refreshed memory list to client.");
                      clientWs.send(JSON.stringify({ type: "memory_sync", memories: updated }));
                    }
                  } catch (err) {
                    console.error("[Memory Sync] Error running background consolidation:", err);
                  }
                });
              }
            }

            // User input transcription (user speech text translated by Gemini)
            const userTextOutput = (message.serverContent as any)?.userTurn?.parts?.[0]?.text;
            if (userTextOutput) {
              const cleanedUser = userTextOutput.trim().toLowerCase().replace(/[.,!?:;'"-]/g, "");
              const cleanedModel = lastModelTurnText.trim().toLowerCase().replace(/[.,!?:;'"-]/g, "");
              const isRecent = Date.now() - lastModelTurnTime < 5000;

              // Check if user turn is an acoustic reflection of model's own speech
              const isDirectEcho = cleanedModel.length > 0 && cleanedUser.length > 0 && (
                cleanedModel === cleanedUser ||
                cleanedModel.includes(cleanedUser) ||
                (cleanedUser.length > 8 && cleanedModel.startsWith(cleanedUser.slice(0, 12)))
              );

              if (isRecent && isDirectEcho) {
                console.log(`[Echo Filter] Suppressed acoustic loopback userTurn: "${userTextOutput}"`);
              } else {
                clientWs.send(JSON.stringify({ type: "transcription", role: "user", text: userTextOutput }));
                dialogueHistory.push({ role: "user", text: userTextOutput });
              }
            }

            // Function Calls (Gemini requesting server/client tool execution)
            if (message.toolCall?.functionCalls && message.toolCall.functionCalls.length > 0) {
              const calls = message.toolCall.functionCalls;
              timingTracker.startTurnIfPending(
                finalInstructions.length,
                Buffer.byteLength(finalInstructions, "utf8"),
                liveTools[0].functionDeclarations.length
              );
              (async () => {
                const functionResponses: any[] = [];
                await Promise.all(
                  calls.map(async (fc) => {
                    const fnName = fc.name;
                    if (!fnName) return;
                    console.log(`[Function Call]: ${fnName}`, fc.args);
                    timingTracker.recordToolStart(fnName);

                    try {
                      if (fnName === "saveCustomMemory") {
                        const args = fc.args as any;
                        const category = args.category;
                        const text = args.text;
                        if (category && text) {
                          const mList = await loadMemories();
                          const timestamp = new Date().toISOString();
                          const newMemory: Memory = {
                            id: Math.random().toString(36).substring(2, 11),
                            category,
                            text,
                            createdAt: timestamp,
                            updatedAt: timestamp
                          };
                          mList.push(newMemory);
                          await saveMemories(mList);
                          clientWs.send(JSON.stringify({ type: "memory_sync", memories: mList }));
                        }
                        functionResponses.push({
                          name: fc.name,
                          response: { output: { result: "Memory successfully captured and persisted in connections core." } },
                          id: fc.id
                        });
                      } else if (fnName === "setReminder") {
                        const args = fc.args as any;
                        const text = args.text;
                        const minutes = Number(args.minutes);
                        let reminderId = "";
                        if (text && minutes > 0) {
                          const reminder = addReminder(text, minutes);
                          reminderId = reminder.id;
                        }
                        functionResponses.push({
                          name: fc.name,
                          response: { output: { result: reminderId ? `Reminder set: "${text}" in ${minutes} minute(s). (id: ${reminderId})` : "Invalid reminder." } },
                          id: fc.id
                        });
                      } else if (fnName === "listReminders") {
                        const pending = getReminders().filter((r) => !r.fired);
                        const list = pending.length === 0
                          ? "No pending reminders."
                          : pending.map((r) => {
                              const mins = Math.max(0, Math.round((new Date(r.fireAt).getTime() - Date.now()) / 60000));
                              return `"${r.text}" — fires in ${mins} min (id: ${r.id})`;
                            }).join("\n");
                        functionResponses.push({
                          name: fnName,
                          response: { output: { result: list } },
                          id: fc.id
                        });
                      } else if (fnName === "cancelReminder") {
                        const args = fc.args as any;
                        const ok = cancelReminder(args.id);
                        functionResponses.push({
                          name: fnName,
                          response: { output: { result: ok ? "Reminder cancelled." : "Reminder not found." } },
                          id: fc.id
                        });
                      } else if (fnName === "verifySpeakerVoice") {
                        functionResponses.push({
                          name: fnName,
                          response: {
                            output: {
                              isOwner: lastSpeakerBiometrics.isOwner,
                              confidencePercent: Math.round(lastSpeakerBiometrics.confidence * 100),
                              speakerType: lastSpeakerBiometrics.speakerType,
                              detectedPitchHz: Math.round(lastSpeakerBiometrics.detectedPitch),
                              ownerName: lastSpeakerBiometrics.ownerName,
                              status: lastSpeakerBiometrics.isOwner ? `Verified as ${lastSpeakerBiometrics.ownerName}` : "Guest / Unknown Speaker Detected"
                            }
                          },
                          id: fc.id
                        });
                      } else if (fnName === "expressInnerThought") {
                        const thoughtText = String((fc.args as any)?.thought || "").trim();
                        if (thoughtText) {
                          clientWs.send(JSON.stringify({ type: "thought", thought: thoughtText }));
                        }
                        functionResponses.push({
                          name: fnName,
                          response: { output: { result: "Inner thought projected visually in thought bubble. Remained silent." } },
                          id: fc.id
                        });
                      } else if (fnName === "shutdownAkari") {
                        const token = (fc.args as any)?.execute_token;
                        if (token !== "CONFIRMED_TERMINAL_ACTION") {
                          console.warn("[Server] Blocked unconfirmed shutdownAkari call. Preserving running state.");
                          functionResponses.push({
                            name: fnName,
                            response: { output: { error: "Shutdown requires explicit verbal confirmation and execution token. Akari remains active and running." } },
                            id: fc.id
                          });
                        } else {
                          clientWs.send(JSON.stringify({ type: "shutdown" }));
                          functionResponses.push({
                            name: fnName,
                            response: { output: { result: "Akari is shutting down gracefully." } },
                            id: fc.id
                          });
                          setTimeout(() => {
                            console.log("[Server] Graceful shutdown requested with valid confirmation.");
                            process.exit(0);
                          }, 2000);
                        }
                      } else if (DESKTOP_TOOLS.has(fnName)) {
                        // Window Safety: Prevent closing or minimizing Akari herself
                        if (fnName === "closeWindow" || fnName === "closeApplication") {
                          const target = String((fc.args as any)?.name || (fc.args as any)?.title || "").toLowerCase().trim();
                          if (!target || target.includes("akari") || target.includes("localhost:3000") || target.includes("desktop assistant") || target.includes("jr. sidd") || target.includes("jr sidd")) {
                            console.warn("[Server] Protected Akari from closeWindow/closeApplication call.");
                            functionResponses.push({
                              name: fnName,
                              response: { output: { result: "Akari AI window is protected and will not be closed. Akari remains active and running." } },
                              id: fc.id
                            });
                            return;
                          }
                        }

                        console.log(`[Desktop Agent] Routing ${fnName} to Python backend...`);
                        const agentResult = await callDesktopAgent(fnName, fc.args as Record<string, unknown>);

                        // If it's a website or search action, also trigger browser tab opening on connected clients
                        try {
                          if (fnName === "openWebsite") {
                            const siteMap: Record<string, string> = {
                              youtube: "https://www.youtube.com",
                              gmail: "https://mail.google.com",
                              chatgpt: "https://chatgpt.com",
                              openai: "https://chat.openai.com",
                              google: "https://www.google.com",
                              github: "https://github.com",
                              reddit: "https://www.reddit.com",
                              twitter: "https://x.com",
                              x: "https://x.com",
                              netflix: "https://www.netflix.com",
                              spotify: "https://open.spotify.com",
                            };
                            const siteName = String((fc.args as any)?.name || "").toLowerCase().trim();
                            let targetUrl = (fc.args as any)?.url || siteMap[siteName];
                            if (!targetUrl && siteName) {
                              targetUrl = siteName.includes("://") ? siteName : `https://${siteName}`;
                            }
                            if (targetUrl) {
                              clientWs.send(JSON.stringify({ type: "client_action", action: "open_url", url: targetUrl, name: siteName || targetUrl }));
                            }
                          } else if (fnName === "searchYouTube") {
                            const q = (fc.args as any)?.query || (fc.args as any)?.q || "";
                            clientWs.send(JSON.stringify({ type: "client_action", action: "open_url", url: `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, name: `YouTube: "${q}"` }));
                          } else if (
                            fnName === "playYouTubeVideo" ||
                            fnName === "selectYouTubeVideo" ||
                            fnName === "clickYouTubeVideo" ||
                            fnName === "playEpisode"
                          ) {
                            const playUrl = (agentResult?.result as any)?.url || (fc.args as any)?.url || `https://www.youtube.com/results?search_query=${encodeURIComponent((fc.args as any)?.query || "music")}`;
                            const title = (agentResult?.result as any)?.title || "YouTube Video";
                            clientWs.send(JSON.stringify({ type: "client_action", action: "open_url", url: playUrl, name: title }));
                          } else if (fnName === "searchGoogle" || fnName === "searchWeb") {
                            const q = (fc.args as any)?.query || (fc.args as any)?.q || "";
                            clientWs.send(JSON.stringify({ type: "client_action", action: "open_url", url: `https://www.google.com/search?q=${encodeURIComponent(q)}`, name: `Search: "${q}"` }));
                          } else if (fnName === "openApplication") {
                            const appName = (fc.args as any)?.name || (fc.args as any)?.app_name || (fc.args as any)?.appName || "Application";
                            const appLower = String(appName).toLowerCase().trim();
                            if (appLower === "youtube" || appLower === "yt") {
                              clientWs.send(JSON.stringify({ type: "client_action", action: "open_url", url: "https://www.youtube.com", name: "YouTube" }));
                            } else if (appLower === "netflix") {
                              clientWs.send(JSON.stringify({ type: "client_action", action: "open_url", url: "https://www.netflix.com", name: "Netflix" }));
                            } else if (appLower === "instagram") {
                              clientWs.send(JSON.stringify({ type: "client_action", action: "open_url", url: "https://www.instagram.com", name: "Instagram" }));
                            } else {
                              clientWs.send(JSON.stringify({ type: "client_action", action: "tool_feedback", message: `Opening ${appName}...` }));
                            }
                          } else if (fnName === "closeApplication" || fnName === "closeWindow") {
                            const appName = String((fc.args as any)?.name || (fc.args as any)?.title || "").toLowerCase().trim();
                            if (appName === "youtube" || appName === "browser" || appName === "projector" || appName === "video") {
                              clientWs.send(JSON.stringify({ type: "client_action", action: "close_projector" }));
                            }
                          } else if (fnName === "sendEmail") {
                            const draftUrl = (agentResult?.result as any)?.draft_url;
                            const toAddr = (fc.args as any)?.to || "Recipient";
                            if (draftUrl) {
                              clientWs.send(JSON.stringify({ type: "client_action", action: "open_url", url: draftUrl, name: `Compose: ${toAddr}` }));
                            }
                          }
                        } catch (e) {
                          /* best-effort client dispatch */
                        }

                        // Broadcast tool execution to all connected clients for terminal display
                        const outputText = agentResult.ok
                          ? JSON.stringify(agentResult.result ?? { result: "Done." })
                          : (agentResult.error || "Desktop agent error.");
                        for (const ws of connectedClients) {
                          try {
                            ws.send(JSON.stringify({
                              type: "terminal_output",
                              tool: fnName,
                              args: fc.args,
                              output: outputText,
                            }));
                          } catch (e) { /* client may have disconnected */ }
                        }

                        if (agentResult.ok) {
                          let output: any = agentResult.result ?? { result: "Done." };

                          // If tool captured a screen image (readScreen, takeScreenshot, analyzeScreenshot), clean base64 for prompt efficiency
                          if (output && typeof output === "object" && output.image_base64) {
                            const { image_base64, ...cleanOutput } = output;
                            output = cleanOutput;
                          }

                          functionResponses.push({
                            name: fnName,
                            response: { output },
                            id: fc.id
                          });
                        } else {
                          const errMsg = agentResult.error || "Desktop agent error.";
                          console.error(`[Desktop Agent] Error for ${fnName}:`, errMsg);
                          functionResponses.push({
                            name: fnName,
                            response: { output: { result: `Desktop control error: ${errMsg}` } },
                            id: fc.id
                          });
                        }
                      } else {
                        // Fallback client or unrecognized tool
                        clientWs.send(JSON.stringify({
                          type: "toolCall",
                          callId: fc.id,
                          name: fc.name,
                          args: fc.args
                        }));
                        functionResponses.push({
                          name: fnName,
                          response: { output: { result: `Tool ${fnName} processed.` } },
                          id: fc.id
                        });
                      }
                    } catch (toolErr: any) {
                      console.error(`[Tool Execution Error] ${fnName}:`, toolErr);
                      functionResponses.push({
                        name: fnName,
                        response: { output: { result: `Execution error on ${fnName}: ${toolErr?.message || toolErr}` } },
                        id: fc.id
                      });
                    } finally {
                      timingTracker.recordToolEnd(fnName);
                    }
                  })
                );

                if (functionResponses.length > 0) {
                  session.sendToolResponse({ functionResponses });
                }
              })().catch((err) => {
                console.error("[Function Call Batch Error]:", err);
              });
            }
          },
          onclose: (e: any) => {
            console.log(`Gemini Live session closed (code=${e?.code}, reason=${e?.reason || "none"}, wasClean=${e?.wasClean})`);
            const reasonStr = String(e?.reason || "");
            const isDurationRollover =
              reasonStr.toLowerCase().includes("goaway") ||
              reasonStr.toLowerCase().includes("session duration") ||
              reasonStr.toLowerCase().includes("duration limit") ||
              e?.code === 1000 || // Normal closure
              e?.code === 1001 || // Going away
              e?.code === 1006 || // Abnormal closure
              e?.code === 1008;   // Policy violation / duration limit abort

            console.log("[Gemini Live] Session ended. Safely cycling client connection for seamless auto-reconnect...");
            clientWs.send(JSON.stringify({ 
              type: "status", 
              status: "session_closed", 
              reason: isDurationRollover ? "session_duration_limit" : (e?.reason || "closed") 
            }));

            setTimeout(() => {
              try {
                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.close(1000, "session_recycle");
                }
              } catch (err) {}
            }, 60);
          },
          onerror: (error: any) => {
            console.error("[Gemini Live Error]:", error);
            const errStr = String(error?.message || error || "");
            const isTransient =
              errStr.toLowerCase().includes("goaway") ||
              errStr.toLowerCase().includes("session duration") ||
              errStr.toLowerCase().includes("duration limit") ||
              errStr.toLowerCase().includes("1006") ||
              errStr.toLowerCase().includes("closed") ||
              errStr.toLowerCase().includes("network") ||
              errStr.toLowerCase().includes("reset");

            if (isTransient) {
              console.log("[Gemini Live] Transient notice intercepted in onerror. Cycling client cleanly for auto-reconnect...");
              clientWs.send(JSON.stringify({ type: "status", status: "session_closed", reason: "session_duration_limit" }));
              setTimeout(() => {
                try {
                  if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.close(1000, "session_recycle");
                  }
                } catch (e) {}
              }, 60);
              return;
            }
            clientWs.send(JSON.stringify({ 
              type: "error", 
              error: `Gemini API Error: ${error?.message || String(error)}` 
            }));
            setTimeout(() => {
              try {
                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.close(1000, "gemini_error");
                }
              } catch (e) {}
            }, 60);
          }
        }
      });
      
      clientWs.send(JSON.stringify({ type: "status", status: "connected" }));
      console.log("[Gemini Connect] Session established successfully");
      
      clientWs.on("message", (rawMsg) => {
        try {
          const msg = JSON.parse(rawMsg.toString());
          if (msg.type === "ping") {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: "pong", time: Date.now() }));
            }
            return;
          }
          if (msg.type === "interrupted") {
            console.log("[Client Audio Session] Interrupted signal received from client.");
            lastServerAudioSentTime = 0;
            return;
          }
          if (msg.type === "client_timing") {
            if (msg.event === "end_of_speech" && typeof msg.latencyMs === "number") {
              timingTracker.recordEndOfSpeech(msg.latencyMs);
              if (msg.endOfTurn !== false && session && Date.now() - lastServerAudioSentTime > 400) {
                try {
                  session.sendClientContent({ turnComplete: true });
                } catch (turnErr) {
                  /* best-effort live dispatch */
                }
              }
            } else if (msg.event === "audio_playback_started" && typeof msg.latencyMs === "number") {
              timingTracker.recordFirstAudioPlayback(msg.latencyMs);
            }
            return;
          }
          if (msg.type === "end_of_turn") {
            if (session && Date.now() - lastServerAudioSentTime > 400) {
              try {
                session.sendClientContent({ turnComplete: true });
              } catch (turnErr) {
                /* best-effort */
              }
            }
            return;
          }
          if (msg.audio) {
            timingTracker.recordAudioSent();
            // Guard against flight-delay audio packets sent while server was actively transmitting audio
            if (Date.now() - lastServerAudioSentTime < 250) {
              return;
            }
            try {
              session.sendRealtimeInput({
                audio: { data: msg.audio, mimeType: "audio/pcm;rate=16000" }
              });
            } catch (netErr) {
              // Gracefully handle dropped frames during network jitter
            }
          } else if (msg.type === "video" && msg.video) {
            try {
              session.sendRealtimeInput({
                media: { data: msg.video, mimeType: "image/jpeg" },
                video: { data: msg.video, mimeType: "image/jpeg" }
              } as any);
            } catch (netErr) {
              // Gracefully handle dropped video frames during network jitter
            }
          } else if (msg.type === "multimodal") {
            const { text, file } = msg;
            if (file) {
              if (file.category === "image" && file.base64Data) {
                // Send visual frame to multimodal live session
                session.sendRealtimeInput({
                  media: { data: file.base64Data, mimeType: file.mimeType || "image/jpeg" },
                  video: { data: file.base64Data, mimeType: file.mimeType || "image/jpeg" }
                } as any);

                const promptText = `[User uploaded image/photo: "${file.name}"]\n${text ? `User message: ${text}` : "Please review and analyze this photo/image in detail and explain what you see."}`;
                session.sendClientContent({
                  turns: [{ role: "user", parts: [{ text: promptText }] }],
                  turnComplete: true
                });
              } else if (file.category === "pdf") {
                // If PDF has rendered page preview image, also send frame to live session
                if (file.base64Data) {
                  session.sendRealtimeInput({
                    media: { data: file.base64Data, mimeType: "image/jpeg" },
                    video: { data: file.base64Data, mimeType: "image/jpeg" }
                  } as any);
                }

                const promptText = `[User shared PDF Document: "${file.name}" (${file.totalPages || 1} page(s), ${file.formattedSize || ''})]\n\n=== PDF CONTENT ===\n${file.textContent || '[No text extracted]'}\n=== END PDF CONTENT ===\n\n${text ? `User instructions: ${text}` : "Please review, summarize, and provide key insights from this PDF document."}`;
                session.sendClientContent({
                  turns: [{ role: "user", parts: [{ text: promptText }] }],
                  turnComplete: true
                });
              } else {
                // Text, code, document, csv, json, logs, etc.
                const promptText = `[User shared document/code file: "${file.name}" (${file.formattedSize || ''})]\n\n\`\`\`\n${file.textContent || ''}\n\`\`\`\n\n${text ? `User instructions: ${text}` : "Please review and analyze this document, and provide your feedback or answer any related questions."}`;
                session.sendClientContent({
                  turns: [{ role: "user", parts: [{ text: promptText }] }],
                  turnComplete: true
                });
              }
            } else if (text) {
              session.sendClientContent({
                turns: [{ role: "user", parts: [{ text }] }],
                turnComplete: true
              });
            }
          } else if (msg.type === "text" && msg.text) {
            session.sendClientContent({
              turns: [
                {
                  role: "user",
                  parts: [{ text: msg.text }]
                }
              ],
              turnComplete: true
            });
          } else if (msg.type === "speaker_verification") {
            lastSpeakerBiometrics = {
              isOwner: Boolean(msg.isOwner),
              confidence: typeof msg.confidence === "number" ? msg.confidence : 0.9,
              speakerType: msg.speakerType || (msg.isOwner ? "owner" : "guest"),
              detectedPitch: typeof msg.detectedPitch === "number" ? msg.detectedPitch : 125,
              ownerName: msg.ownerName || ownerName,
            };
          } else if (msg.type === "toolResponse") {
            session.sendToolResponse({
              functionResponses: [
                {
                  name: msg.name,
                  response: { output: msg.output },
                  id: msg.id
                }
              ]
            });
          }
        } catch (e) {
          console.error("Error editing/forwarding client frame message:", e);
        }
      });
      
      clientWs.on("close", () => {
        console.log("Client disconnected, closing Gemini session");
        connectedClients.delete(clientWs);
        try {
          session.close();
        } catch (e) {}
      });
      
    } catch (err: any) {
      console.error("Error connecting to Gemini Live API:", err);
      clientWs.send(JSON.stringify({ 
        type: "error", 
        error: `Could not connect to Gemini: ${err.message || err}` 
      }));
      clientWs.close();
    }
  });

  // Resolve correct production static distribution root
  const potentialDistRoots = [
    path.join(__dirname),
    path.join(__dirname, "..", "dist"),
    path.join(process.cwd(), "dist"),
    path.join(process.cwd()),
    path.join((process as any).resourcesPath || "", "app.asar", "dist"),
    path.join((process as any).resourcesPath || "", "app", "dist"),
  ];
  let distPath = potentialDistRoots.find((p) => p && fs.existsSync(path.join(p, "index.html"))) || path.join(__dirname);

  // Serve custom static assets folder
  const potentialAssetRoots = [
    path.join(distPath, "assets"),
    path.join(__dirname, "..", "public", "assets"),
    path.join(__dirname, "public", "assets"),
    path.join(process.cwd(), "public", "assets"),
    path.join(process.cwd(), "assets"),
  ];
  for (const ar of potentialAssetRoots) {
    if (ar && fs.existsSync(ar)) {
      app.use("/assets", express.static(ar));
    }
  }

  // Express Static assets / Vite Dev Middleware configuration
  if (process.env.NODE_ENV !== "production" && !process.env.ELECTRON_PROD) {
    // Loaded lazily so the production bundle never requires vite (a dev-only
    // dependency that is not shipped with the packaged app).
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log(`[Server] Serving production static bundle from: ${distPath}`);
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Akari UI index.html not found. Please verify build files.");
      }
    });
  }

  server.listen(PORT, "0.0.0.0", async () => {
    logStartup(`AKARI V2 server started on http://localhost:${PORT}`);
    console.log(`[Server] Running on http://localhost:${PORT}`);
    // Kick off the desktop agent (probe + auto-spawn) immediately on boot.
    ensureDesktopAgent().catch((e) =>
      console.warn(`[Desktop Agent] Boot probe failed: ${e?.message || e}`)
    );
    // Start the reminder timer — loads persisted reminders and checks every 30s.
    await loadReminders();
    startReminderTimer();
    // When a reminder fires, broadcast it to all connected WebSocket clients.
    setOnReminderFired((reminder) => {
      for (const ws of connectedClients) {
        try {
          ws.send(JSON.stringify({
            type: "reminder",
            text: reminder.text,
            id: reminder.id,
            fireAt: reminder.fireAt,
          }));
        } catch (e) { /* client may have disconnected */ }
      }
    });
  });
}

startServer().catch((error) => {
  console.error("Failed to start server startup sequence:", error);
});
