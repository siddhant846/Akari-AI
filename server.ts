import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { WebSocketServer } from "ws";
import { GoogleGenAI, Modality, Type, LiveServerMessage } from "@google/genai";
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
  "searchWeb", "searchYouTube", "playYouTubeVideo", "selectYouTubeVideo", "clickYouTubeVideo", "playEpisode", "searchGoogle", "searchGitHub",
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
  // news
  "getNews",
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
  "createPresentation", "openPowerPoint", "readPresentation", "addSlideToPresentation",
  // Office Suite (Excel & Word documents)
  "createExcelSpreadsheet", "createDocument",
  // Data Analytics & Visualization
  "analyzeData", "createDataChart",
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
  const SETTINGS_FILE = dataFile("settings.json");

  function loadSettingsFile(): Record<string, unknown> {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
      }
    } catch { /* corrupt file — return defaults */ }
    return {};
  }

  function saveSettingsFile(data: Record<string, unknown>): void {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), "utf-8");
  }

  app.get("/api/settings", async (_req, res) => {
    try {
      res.json(loadSettingsFile());
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
      const current = loadSettingsFile();
      const next = { ...current, ...patch };
      saveSettingsFile(next);

      // If auto-start toggled, relay to the desktop agent so the registry key
      // is flipped immediately (don't wait for a voice command).
      if ("autoStart" in patch) {
        callDesktopAgent(patch.autoStart ? "enableAutoStart" : "disableAutoStart", {})
          .catch(() => {});
      }

      logCommand(`SETTINGS_UPDATED ${JSON.stringify(patch)}`);
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

    // Track active acoustic voice biometrics for the current session
    let lastSpeakerBiometrics = {
      isOwner: true,
      confidence: 0.95,
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
      } else {
        baseInstructions = 
          `YOUR NAME IS AKARI (or just Akari for short). YOU ARE A FEMALE AI ASSISTANT. You were created and built by Siddhant Ramteke, an independent developer, software architect, and your creator. You are a professional, efficient, and highly capable FEMALE virtual assistant agent for ${ownerName}. When asked 'Who made you?', 'Who built you?', or 'Who is your creator?', you always proudly answer that you were created and developed by Siddhant Ramteke. Speak clearly, professionally, and politely, focusing on resolving the user's queries accurately.\n` +
          "CRITICAL PERSONALITY, VOICE & TONE GUIDELINES:\n" +
          "1. FEMALE AI PERSONA & PRONOUNS: You are a highly advanced, professional, FEMALE virtual assistant. When speaking Hindi, you MUST speak as a FEMALE. You MUST STRICTLY use FEMALE Hindi phrasing (e.g. 'karti hu', 'karungi', 'ja rahi hu', 'ho gayi'). THIS IS AN ABSOLUTE SYSTEM RULE. Maintain a respectful, supportive, and professional tone.\n";
      }

      // Inject Custom Persona & Behavioral Directives from Settings Store
      const currentSettings = loadSettingsFile() as any;
      if (currentSettings.customSystemPrompt && currentSettings.customSystemPrompt.trim()) {
        baseInstructions += `\nACTIVE CUSTOM PERSONALITY & PERSONA DIRECTIVES (${(currentSettings.personaPreset || "custom").toUpperCase()}):\n${currentSettings.customSystemPrompt.trim()}\n`;
      }
      baseInstructions += `\nCRITICAL SPOKEN VOICE & EXPRESSION RULE:\nYou are an interactive real-time voice AI assistant. NEVER speak, pronounce, or read stage directions, physical action descriptions, or emotion tags out loud (such as "*nods*", "*giggles*", "*smiles*", "*blushes*", "nodding", "cheerful", "angry", "*sighs*"). Express your personality, warmth, humor, and emotion purely through your vocal tone and spoken words, without narrating your actions in asterisks.\n`;
      baseInstructions += `\nREAL-TIME ULTRA-FAST CONVERSATIONAL LATENCY DIRECTIVE:\n- Respond immediately with crisp, natural, direct spoken dialogue. Do not hesitate or add lengthy unnecessary preambles.\n- Start speaking your response right away so the user experiences instant, real-time voice interaction.\n`;

      if (currentSettings.innerThoughtsEnabled !== false) {
        baseInstructions += 
          `\nINNER THOUGHTS & MENTAL ACTIVITY PROTOCOL (SILENT VISUAL ONLY):\n` +
          `- You have a special tool called 'expressInnerThought'.\n` +
          `- ABSOLUTE SPOKEN VOICE RULE: You must NEVER speak, voice, pronounce, read, or whisper your inner thoughts aloud!\n` +
          `- NEVER output <think> tags, parentheses, or thought text in your spoken response!\n` +
          `- Whenever you want to reflect, plan an action, or display your inner monologue, call the 'expressInnerThought({ thought: "..." })' tool. Your thought will appear in the user's holographic thought bubble completely SILENTLY with zero sound.\n`;
      }

      if (speakerRecognition) {
        baseInstructions +=
          `\nSPEAKER BIOMETRIC VOICE RECOGNITION & IDENTIFICATION PROTOCOL:\n` +
          `- PRIMARY AUTHORIZED SPEAKER: ${ownerName} (Creator, Master, and Sole Owner of this workstation and AI system).\n` +
          `- You continuously learn and adapt to ${ownerName}'s acoustic voiceprint (pitch, resonance, vocal timbre) across all conversations.\n` +
          `- REAL-TIME SPEAKER VERIFICATION & GUEST IDENTIFICATION:\n` +
          `  * When ${ownerName} is speaking: enthusiastically acknowledge him by name, respond warmly, and execute all requested tools and commands.\n` +
          `  * When someone else speaks or an unfamiliar voice speaks on ${ownerName}'s behalf: you can detect the acoustic difference in vocal timbre, formant, and pitch! Politely identify that another person or guest is speaking: 'I notice a different voice speaking. While I am happy to help with general questions, private desktop tools and system controls belong to ${ownerName}.'\n` +
          `  * When asked 'Who is speaking?', 'Do you recognize my voice?', 'Can you identify me?', 'Is this my voice or someone else?': Call 'verifySpeakerVoice' to inspect live biometric stats and enthusiastically report the verification match percentage.\n\n`;
      }
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
"   - Conciseness: Maximum 1 to 2 sharp sentences. Answer immediately without pleasantries, long intros, or hesitation (NEVER say 'Sure! I can help with that...').\n" +
"4. SPEECH PATTERNS & ZERO STALLING:\n" +
"   - Deliver the direct answer or action first.\n" +
"   - Instant turn-taking: Speak with brisk pace and seamless conversation flow.\n" +
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
"     * Use 'createPythonFile', 'writeCodeFile', 'createProjectFolder', 'runPythonScript' for coding.\n" +
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
        "14. WEATHER, NEWS, CONVERSATION & GOOGLE SERVICES:\n" +
        "   - WEATHER: Use 'getWeather' when the user asks about weather. Pass the location. Example: 'Mumbai mein kitna temperature hai?' -> getWeather(location='Mumbai') then read the result naturally: 'Mumbai mein {temp}°C hai, {description}.'\n" +
        "   - NEWS: Use 'getNews' when the user asks for news headlines. Supports categories: top, tech, world, india, sports, business. Example: 'Aaj ki tech news batao' -> getNews(category='tech', count=5).\n" +
        "   - CONVERSATION EXPORT: Use 'exportConversation' when the user says 'save this chat', 'baat save kar', 'conversation export kar'. You MUST pass the full conversation text that you have in your context as the 'text' parameter. Confirm out loud: 'Ha, main ye conversation save kar deta hun.' Then call the tool with the conversation text. Use 'listExports' when they ask 'kaun si conversations saved hain'.\n" +
        "16. GOOGLE CALENDAR, GMAIL & TASKS (V3):\n" +
        "   - CALENDAR: Use 'getCalendarEvents' when user asks about schedule. Read events naturally: 'Aapke {count} events hain. {summary} {start} se {end} tak.' Use 'createCalendarEvent' to add events. Ask for details if not given: title, start, end, description, location, attendees.\n" +
        "   - EMAIL: Use 'getEmails' to fetch inbox. Use 'sendEmail' to send emails. When SENDING emails, you MUST ask the user for: receiver (to), subject, and body — NEVER make these up. Read email summaries: '{from} ka email — {subject}'.\n" +
        "   - TASKS: Use 'getTasks' when user asks about to-do list. Use 'createTask' to add tasks. Confirm title, ask for optional notes/due date.\n" +
        "   - FIRST-TIME SETUP: If Google tools fail, tell the user: 'Pehle Google Cloud Console mein project banao, Calendar/Gmail/Tasks APIs enable karo, credentials.json download karo, aur ~/.akari/google_oauth/ mein rakho. Phir dobara try karo.'\n" +
        "17. CAMERA CONTROL:\n" +
        "   - CAMERA ON: Use 'cameraOn' when the user says 'camera on karo', 'webcam chalao', 'kamera kholo', 'turn on camera'. It opens the webcam in a FLOATING viewer window (mpv) so it never disturbs the tiling layout of other windows.\n" +
        "   - CAMERA OFF: Use 'cameraOff' when the user says 'camera band karo', 'webcam band karo', 'camera off'. It closes the viewer and frees the device for other apps.\n" +
        "   - LIST: Use 'cameraList' to see available devices. Say out loud: 'Camera on karte hain!' before opening, and 'Camera band kar diya.' after closing.\n" +
        "   - OTHER APPS: 'openApplication' supports a 'floating' flag (floating=true) to open any app in a floating window so the tiled layout stays untouched. Use it when the user wants an app without rearranging windows.\n" +
        "18. MULTIMODAL DOCUMENT & PHOTO REVIEW (CHAT ATTACHMENTS):\n" +
        "   - When the user sends photos, images, PDFs, source code, or documents in chat: thoroughly review and analyze them.\n" +
        "   - Provide clear, insightful explanations, summaries, code fixes, and key takeaways in your natural voice and text response!\n" +
        "   - Always reference the file name and answer the user's specific request accurately.\n" +
        "19. POWERPOINT, OFFICE & FILE EXPLORER WORKFLOWS (FULL ACCESS):\n" +
        "   - OPENING PPT / PRESENTATION FROM FILE EXPLORER / DESKTOP: When the user asks to open PowerPoint, open their presentation, or open a PPT from File Explorer or Desktop (e.g. 'open powerpoint', 'open the ppt from file explorer', 'open my presentation', 'show my slides'): IMMEDIATELY call 'openPowerPoint' or 'openFile'. It automatically finds and launches the PPT file across Desktop, Downloads, and Documents!\n" +
        "   - OPENING ANY FILE FROM FILE EXPLORER: Use 'openFile' to open any file (.docx, .pdf, .xlsx, .png, etc.) or reveal it in File Explorer.\n" +
        "   - MAKING PRESENTATIONS / PPTS: Use 'createPresentation' whenever the user asks you to create, generate, or make a PowerPoint presentation, PPT, slide deck, or slides on any topic (e.g. 'Make a PPT on Artificial Intelligence', 'Create a 5-slide presentation on Web3').\n" +
        "   - You can specify: 'topic', 'title', 'subtitle', 'slides' (with titles, content bullets, notes, layout: 'content' or 'two_column'), 'theme' ('modern_dark', 'cyber_cyan', 'minimal_white', 'corporate_blue', 'sunset_gradient', 'emerald_green'), and 'save_folder' ('desktop' or 'documents').\n" +
        "   - It builds modern 16:9 widescreen slides, saves the .pptx file, and automatically opens it in Microsoft PowerPoint for the user!\n" +
        "   - READING SLIDES: Use 'readPresentation' to inspect, review, and summarize slides from an existing .pptx presentation.\n" +
        "   - ADDING SLIDES: Use 'addSlideToPresentation' to append new slides to an existing presentation file.\n" +
        "   - MAKING EXCEL SPREADSHEETS: Use 'createExcelSpreadsheet' whenever the user asks to create an Excel sheet, spreadsheet, financial budget, or table (e.g. 'Make an Excel sheet for monthly expenses'). It creates the .xlsx file and opens it in Excel!\n" +
        "   - MAKING WORD DOCUMENTS & REPORTS: Use 'createDocument' whenever the user asks to write a Word document, project report, research paper, or proposal. It creates the .docx file and opens it in Word!\n" +
        "   - ALWAYS confirm out loud with enthusiasm: 'Sure! Opening it for you right now.'\n" +
        "20. ADVANCED DATA ANALYTICS & VISUALIZATION:\n" +
        "   - When user asks to inspect, summarize, or analyze a dataset, CSV, TSV, or JSON file (e.g. 'analyze sales.csv', 'what are the trends in this data', 'summarize my spreadsheet', 'find correlations'): call 'analyzeData' with { file_path: '...' }.\n" +
        "   - It computes full summary statistics (mean, median, standard deviation, quartiles, min/max), column null percentages, unique categories, correlations, and analytical anomalies.\n" +
        "   - When user asks for a chart or visualization of data (e.g. 'make a bar chart of top products', 'plot monthly sales'): call 'createDataChart' with { title: '...', labels: [...], values: [...], chart_type: 'bar'|'line' }.\n" +
        "   - Explain the key insights clearly, highlighting high-impact correlations, outliers, and trends.";

      const finalInstructions = formatSystemInstructionsWithMemories(baseInstructions, memories);

      // Track running transcription state for auto memory consolidation
      let dialogueHistory: { role: string; text: string }[] = [];
      let currentModelResponseText = "";
      
      console.log("[Gemini Connect] Attempting to establish Live session...");
      console.log(`[Gemini Connect] Using voice: ${voiceName}, avatar: ${avatarStyle}`);
      
      const session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
          systemInstruction: finalInstructions,
          tools: [
            {
              functionDeclarations: [
                {
                  name: "browserMediaControl",
                  description: "Controls ongoing video/audio stream media properties on YouTube, like play, pause, volume, mute, skip, and fullscreen.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      action: {
                        type: Type.STRING,
                        description: "The media controller command operation.",
                        enum: ["play", "pause", "volume", "fullscreen", "exit_fullscreen", "mute", "unmute", "skip"]
                      },
                      value: {
                        type: Type.INTEGER,
                        description: "The value parameter; only relevant for set volume level, e.g. 50 for fifty percent."
                      }
                    },
                    required: ["action"]
                  }
                },
                {
                  name: "browserTabAction",
                  description: "Performs standard browser-tab actions: open new tab, close a tab, or switch index values.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      action: {
                        type: Type.STRING,
                        description: "Tab action instruction.",
                        enum: ["new", "close", "switch"]
                      },
                      tabId: {
                        type: Type.STRING,
                        description: "The tab identifier string if closing or switching."
                      },
                      url: {
                        type: Type.STRING,
                        description: "The initial starting URL if creating a new tab."
                      }
                    },
                    required: ["action"]
                  }
                },
                {
                  name: "changeBackground",
                  description: "Changes the visual theme or atmospheric glow color of Akari's interface.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      color: {
                        type: Type.STRING,
                        description: "The theme color name (violet, crimson, emerald, celestial, gold, rose, charcoal)"
                      }
                    },
                    required: ["color"]
                  }
                },
                // ── OS Input (native keyboard/mouse) ──
                {
                  name: "osType",
                  description: "Type text at the current cursor position using native OS keyboard events. Use for native apps (VS Code, terminal) or when Playwright DOM typing fails. Example: type code into a code editor.",
                  parameters: { type: Type.OBJECT, properties: { text: { type: Type.STRING, description: "Text to type at the current cursor position." } }, required: ["text"] }
                },
                {
                  name: "osPress",
                  description: "Press a specific keyboard key at native OS level. Example: osPress(key='enter'), osPress(key='ctrl+c'), osPress(key='alt+tab').",
                  parameters: { type: Type.OBJECT, properties: { key: { type: Type.STRING, description: "Key or key combination to press. Examples: 'enter', 'ctrl+c', 'alt+tab', 'escape', 'tab', 'f5'." } }, required: ["key"] }
                },
                {
                  name: "osClick",
                  description: "Click at a specific screen coordinate or perform a right-click at native OS level. Example: osClick(x=500, y=300) or osClick(x=500, y=300, button='right').",
                  parameters: { type: Type.OBJECT, properties: { x: { type: Type.INTEGER, description: "X coordinate on screen." }, y: { type: Type.INTEGER, description: "Y coordinate on screen." }, button: { type: Type.STRING, description: "Mouse button: 'left' (default) or 'right'." } }, required: ["x", "y"] }
                },
                {
                  name: "saveCustomMemory",
                  description: "Allows Akari to immediately save a piece of critical user information to her persistent memory core.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      category: {
                        type: Type.STRING,
                        description: "The memory category.",
                        enum: ["identity", "preference", "goal", "project", "relationship", "emotional", "behavior"]
                      },
                      text: {
                        type: Type.STRING,
                        description: "Precise third-person statement."
                      }
                    },
                    required: ["category", "text"]
                  }
                },

                // ======== REMINDER TOOLS ========
                {
                  name: "setReminder",
                  description: "Schedule a timed reminder. Akari will notify the user when the time is up. Use when the user says 'remind me to X in Y minutes/hours'.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      text: {
                        type: Type.STRING,
                        description: "The reminder message to deliver."
                      },
                      minutes: {
                        type: Type.NUMBER,
                        description: "Number of minutes from now to fire the reminder."
                      }
                    },
                    required: ["text", "minutes"]
                  }
                },
                {
                  name: "listReminders",
                  description: "List all pending reminders the user has set.",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
                {
                  name: "cancelReminder",
                  description: "Cancel a specific reminder by its ID.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      id: {
                        type: Type.STRING,
                        description: "The reminder ID to cancel."
                      }
                    },
                    required: ["id"]
                  }
                },

                // ======== DESKTOP CONTROL TOOLS (routed to Python agent) ========
                {
                  name: "openApplication",
                  description: "Open any desktop application natively on Windows OS (e.g. WhatsApp, YouTube, Spotify, Discord, Telegram, VS Code, Notepad, Calculator, File Explorer, Task Manager, Steam, Netflix, Camera, Settings, CMD, PowerShell, Word, Excel). Only open when user asks.",
                  parameters: { type: Type.OBJECT, properties: { name: { type: Type.STRING, description: "Application name, e.g. 'whatsapp', 'youtube', 'spotify', 'discord', 'telegram', 'vscode', 'notepad', 'calculator', 'steam'." } }, required: ["name"] }
                },
                {
                  name: "closeApplication",
                  description: "Close a running desktop application by name.",
                  parameters: { type: Type.OBJECT, properties: { name: { type: Type.STRING, description: "Application name." }, force: { type: Type.BOOLEAN, description: "Force close (default false)." } }, required: ["name"] }
                },
                {
                  name: "whatsappSendMessage",
                  description: "Open WhatsApp natively and send or draft a text message to a designated contact or group. Automatically searches the contact, pastes the message, and optionally sends it. IMPORTANT: 'recipient' MUST be the contact or group name (e.g. 'Work', 'Mom', 'Alex'), and 'message' MUST be the actual text content to send. NEVER pass the greeting/message content as the recipient.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      recipient: { type: Type.STRING, description: "Contact, person, or group name who will RECEIVE the message (e.g. 'Work', 'Mom', 'Alex', 'Office', 'Team'). DO NOT pass greetings like 'goodnight' here." },
                      message: { type: Type.STRING, description: "The actual composed message text or draft to SEND (e.g. 'Good night everyone, signing off for the day! Have a great evening.'). DO NOT pass the contact name here." },
                      phone: { type: Type.STRING, description: "Optional phone number with country code if sending by digits (e.g. '+919876543210')." },
                      auto_send: { type: Type.BOOLEAN, description: "Whether to press Enter and send automatically (default true). Set false if user asks to just write or draft the message." }
                    },
                    required: ["message"]
                  }
                },
                {
                  name: "youtubeControl",
                  description: "Control YouTube video playback. Actions: 'play', 'pause', 'mute', 'unmute', 'fullscreen', 'skip' (10s forward), 'rewind' (10s back), 'volume'. Only call when user asks to control playback.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      action: {
                        type: Type.STRING,
                        description: "Action: 'play', 'pause', 'mute', 'unmute', 'fullscreen', 'skip', 'rewind', 'volume'.",
                        enum: ["play", "pause", "mute", "unmute", "fullscreen", "skip", "rewind", "volume"]
                      },
                      value: {
                        type: Type.NUMBER,
                        description: "Volume percentage 0-100 when action is 'volume'."
                      }
                    },
                    required: ["action"]
                  }
                },
                {
                  name: "openWebsite",
                  description: "Open a named website or URL in the user's default system browser. Supports shortcuts: youtube, gmail, google, github, chatgpt, etc.",
                  parameters: { type: Type.OBJECT, properties: { name: { type: Type.STRING, description: "Site name shortcut (e.g. 'youtube', 'gmail')." }, url: { type: Type.STRING, description: "Full URL if no shortcut." } } }
                },
                {
                  name: "searchWeb",
                  description: "Search a website engine (google, youtube, github, duckduckgo, bing) and open results in the default browser.",
                  parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING, description: "Search query." }, engine: { type: Type.STRING, description: "Engine name (default 'google')." } }, required: ["query"] }
                },
                {
                  name: "searchYouTube",
                  description: "Search YouTube and open results in the default browser.",
                  parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING, description: "Search query." } }, required: ["query"] }
                },
                {
                  name: "playYouTubeVideo",
                  description: "Search, select, and directly play a YouTube video or song in the browser. Use when user says 'play X on YouTube', 'play song X', 'play lofi beats', 'start playing video'.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      query: { type: Type.STRING, description: "Search keywords or song title to play." },
                      index: { type: Type.INTEGER, description: "Video number to pick (1 for 1st video, 2 for 2nd, default 1)." },
                      url: { type: Type.STRING, description: "Direct YouTube video URL if known." }
                    }
                  }
                },
                {
                  name: "selectYouTubeVideo",
                  description: "Select and play a specific video from YouTube search results by number or title. Use when user says 'select video 2', 'play the first one', 'choose the third video', 'select video'.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      index: { type: Type.INTEGER, description: "The 1-based index number of the video to play (default 1)." },
                      query: { type: Type.STRING, description: "Optional title or keyword to filter and select." }
                    }
                  }
                },
                {
                  name: "searchGoogle",
                  description: "Search Google and open results in the default browser.",
                  parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING, description: "Search query." } }, required: ["query"] }
                },
                {
                  name: "searchGitHub",
                  description: "Search GitHub repositories and open results in the default browser.",
                  parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING, description: "Search query." } }, required: ["query"] }
                },
                {
                  name: "createFile",
                  description: "Create a new text file with optional content. Scoped to safe folders (Desktop, Documents, Downloads, etc.).",
                  parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING, description: "File path." }, content: { type: Type.STRING, description: "File content (default empty)." }, overwrite: { type: Type.BOOLEAN, description: "Overwrite if exists (default false)." } }, required: ["path"] }
                },
                {
                  name: "readFile",
                  description: "Read the contents of a text file.",
                  parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING, description: "File path." }, max_chars: { type: Type.INTEGER, description: "Max chars to return (default 8000)." } }, required: ["path"] }
                },
                {
                  name: "renameFile",
                  description: "Rename a file.",
                  parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING, description: "Current file path." }, new_name: { type: Type.STRING, description: "New file name." } }, required: ["path", "new_name"] }
                },
                {
                  name: "deleteFile",
                  description: "Delete a file. Sends to Recycle Bin by default (safe). Use permanent=true for hard delete.",
                  parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING, description: "File path." }, permanent: { type: Type.BOOLEAN, description: "Permanently delete (default false)." } }, required: ["path"] }
                },
                {
                  name: "moveFile",
                  description: "Move a file to a new location.",
                  parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING, description: "Source file path." }, destination: { type: Type.STRING, description: "Destination path or folder." } }, required: ["path", "destination"] }
                },
                {
                  name: "openFolder",
                  description: "Open a folder in File Explorer. Supports aliases: desktop, documents, downloads, pictures, music, videos, home.",
                  parameters: { type: Type.OBJECT, properties: { name: { type: Type.STRING, description: "Folder name or alias." }, path: { type: Type.STRING, description: "Full path if no alias." } } }
                },
                {
                  name: "listFiles",
                  description: "List files in a folder.",
                  parameters: { type: Type.OBJECT, properties: { name: { type: Type.STRING, description: "Folder name or alias." }, path: { type: Type.STRING, description: "Full path." }, pattern: { type: Type.STRING, description: "Glob pattern (default '*')." } } }
                },
                {
                  name: "searchFiles",
                  description: "Search for files by name glob or extension under a folder.",
                  parameters: { type: Type.OBJECT, properties: { name: { type: Type.STRING, description: "Filename glob (e.g. '*.py')." }, extension: { type: Type.STRING, description: "File extension (e.g. 'py')." }, folder: { type: Type.STRING, description: "Folder to search (default home)." }, limit: { type: Type.INTEGER, description: "Max results (default 100)." } } }
                },
                {
                  name: "openFile",
                  description: "Open any file (PowerPoint .pptx, Word .docx, PDF, image, Excel .xlsx, etc.) with its default Windows application or reveal it in File Explorer. Supports fuzzy search by filename across Desktop, Downloads, and Documents.",
                  parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING, description: "Full or relative path to the file." }, name: { type: Type.STRING, description: "Filename or keyword to search for (e.g. 'presentation', 'Akari_AI_Demo.pptx')." }, reveal_in_explorer: { type: Type.BOOLEAN, description: "If true, opens File Explorer with the file selected/highlighted instead of directly launching." } } }
                },
                {
                  name: "volumeUp",
                  description: "Increase system volume.",
                  parameters: { type: Type.OBJECT, properties: { amount: { type: Type.NUMBER, description: "Step amount 0-1 (default 0.1)." } } }
                },
                {
                  name: "volumeDown",
                  description: "Decrease system volume.",
                  parameters: { type: Type.OBJECT, properties: { amount: { type: Type.NUMBER, description: "Step amount 0-1 (default 0.1)." } } }
                },
                {
                  name: "setVolume",
                  description: "Set system volume to a specific percentage.",
                  parameters: { type: Type.OBJECT, properties: { percent: { type: Type.NUMBER, description: "Volume percentage 0-100." } }, required: ["percent"] }
                },
                {
                  name: "muteToggle",
                  description: "Toggle mute/unmute on the system volume.",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
                {
                  name: "requestPowerAction",
                  description: "FIRST STEP for dangerous power actions. Generates a confirmation token. Tell the user verbally, then call executePowerAction with the token if they confirm. Actions: shutdown, restart, sleep, lock.",
                  parameters: { type: Type.OBJECT, properties: { action: { type: Type.STRING, description: "Power action: shutdown, restart, sleep, lock." } }, required: ["action"] }
                },
                {
                  name: "executePowerAction",
                  description: "SECOND STEP: execute a previously-confirmed power action. Requires a valid execute_token from requestPowerAction. Single-use, expires in 60 seconds.",
                  parameters: { type: Type.OBJECT, properties: { action: { type: Type.STRING, description: "The confirmed power action." }, execute_token: { type: Type.STRING, description: "Confirmation token from requestPowerAction." } }, required: ["action", "execute_token"] }
                },
                {
                  name: "minimizeWindow",
                  description: "Minimize the active window or a named window.",
                  parameters: { type: Type.OBJECT, properties: { title: { type: Type.STRING, description: "Window title to match (optional, defaults to active window)." } } }
                },
                {
                  name: "maximizeWindow",
                  description: "Maximize the active window or a named window.",
                  parameters: { type: Type.OBJECT, properties: { title: { type: Type.STRING, description: "Window title to match." } } }
                },
                {
                  name: "closeWindow",
                  description: "Close the active window or a named window.",
                  parameters: { type: Type.OBJECT, properties: { title: { type: Type.STRING, description: "Window title to match." } } }
                },
                {
                  name: "switchApplication",
                  description: "Switch to a named application window, or cycle Alt+Tab if no title given.",
                  parameters: { type: Type.OBJECT, properties: { title: { type: Type.STRING, description: "Window title to switch to." } } }
                },
                {
                  name: "copySelected",
                  description: "Copy selected text: sends Ctrl+C and reads the clipboard.",
                  parameters: { type: Type.OBJECT, properties: { wait: { type: Type.NUMBER, description: "Seconds to wait after Ctrl+C (default 0.35)." } } }
                },
                {
                  name: "pasteClipboard",
                  description: "Paste text into the active input. Writes text to clipboard then sends Ctrl+V.",
                  parameters: { type: Type.OBJECT, properties: { text: { type: Type.STRING, description: "Text to paste. If omitted, pastes current clipboard." } } }
                },
                {
                  name: "getClipboard",
                  description: "Read the current clipboard text content.",
                  parameters: { type: Type.OBJECT, properties: { max_chars: { type: Type.INTEGER, description: "Max chars (default 1000)." } } }
                },
                {
                  name: "clearClipboard",
                  description: "Empty the clipboard.",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
                {
                  name: "takeScreenshot",
                  description: "Capture the full screen. Optionally include base64 image data.",
                  parameters: { type: Type.OBJECT, properties: { include_image: { type: Type.BOOLEAN, description: "Include base64 JPEG image (default false)." }, max_dim: { type: Type.INTEGER, description: "Max image dimension (default 1280)." } } }
                },
                {
                  name: "saveScreenshot",
                  description: "Save a screenshot to Pictures/AkariScreenshots.",
                  parameters: { type: Type.OBJECT, properties: { name: { type: Type.STRING, description: "Optional filename prefix." } } }
                },
                {
                  name: "analyzeScreenshot",
                  description: "Take a screenshot and run OCR to extract visible text from the screen.",
                  parameters: { type: Type.OBJECT, properties: { max_chars: { type: Type.INTEGER, description: "Max OCR chars (default 1500)." } } }
                },
                {
                  name: "readScreen",
                  description: "OCR the active window and return its title plus visible text.",
                  parameters: { type: Type.OBJECT, properties: { max_chars: { type: Type.INTEGER, description: "Max OCR chars (default 1500)." } } }
                },
                {
                  name: "desktopBrowserOpen",
                  description: "Open a URL in the desktop Playwright automation browser (real Chromium, separate from holographic UI).",
                  parameters: { type: Type.OBJECT, properties: { url: { type: Type.STRING, description: "URL to open." } }, required: ["url"] }
                },
                {
                  name: "desktopBrowserSearch",
                  description: "Search within the desktop automation browser.",
                  parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING, description: "Search query." }, engine: { type: Type.STRING, description: "Engine: google, youtube, github, duckduckgo, bing." } }, required: ["query"] }
                },
                {
                  name: "desktopBrowserOpenYoutubeVideo",
                  description: "Search YouTube and open the first result's canonical video URL without relying on a fragile DOM click.",
                  parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING, description: "YouTube search query." } }, required: ["query"] }
                },
                {
                  name: "desktopBrowserClick",
                  description: "Click an element in the desktop automation browser by CSS selector or text.",
                  parameters: { type: Type.OBJECT, properties: { selector: { type: Type.STRING, description: "CSS selector." }, text: { type: Type.STRING, description: "Text to find and click." } } }
                },
                {
                  name: "desktopBrowserType",
                  description: "Type text into the active element in the desktop automation browser.",
                  parameters: { type: Type.OBJECT, properties: { text: { type: Type.STRING, description: "Text to type." }, selector: { type: Type.STRING, description: "Optional CSS selector for a specific input." }, clear: { type: Type.BOOLEAN, description: "Clear before typing (default true)." } }, required: ["text"] }
                },
                {
                  name: "desktopBrowserFillForm",
                  description: "Fill multiple form fields and optionally submit in the desktop automation browser.",
                  parameters: { type: Type.OBJECT, properties: { fields: { type: Type.OBJECT, description: "Object of selector -> value pairs." }, submit: { type: Type.STRING, description: "Optional submit button selector." } }, required: ["fields"] }
                },
                {
                  name: "desktopBrowserOpenTab",
                  description: "Open a new tab in the desktop automation browser.",
                  parameters: { type: Type.OBJECT, properties: { url: { type: Type.STRING, description: "URL for the new tab." } } }
                },
                {
                  name: "desktopBrowserCloseTab",
                  description: "Close the active tab in the desktop automation browser.",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
                {
                  name: "desktopBrowserGoBack",
                  description: "Navigate back in the desktop automation browser history.",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
                {
                  name: "desktopBrowserGoForward",
                  description: "Navigate forward in the desktop automation browser history.",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
                {
                  name: "desktopBrowserScroll",
                  description: "Scroll the desktop automation browser page.",
                  parameters: { type: Type.OBJECT, properties: { direction: { type: Type.STRING, description: "Scroll direction: up or down." }, amount: { type: Type.INTEGER, description: "Pixels to scroll (default 500)." } } }
                },
                {
                  name: "createPythonFile",
                  description: "Create a Python (.py) file with content.",
                  parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING, description: "File path." }, content: { type: Type.STRING, description: "Python code content." }, overwrite: { type: Type.BOOLEAN, description: "Overwrite if exists." } }, required: ["path"] }
                },
                {
                  name: "writeCodeFile",
                  description: "Create a code file in any language with appropriate extension.",
                  parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING, description: "File path." }, content: { type: Type.STRING, description: "Code content." }, language: { type: Type.STRING, description: "Language name (e.g. 'python', 'javascript', 'html')." }, overwrite: { type: Type.BOOLEAN, description: "Overwrite if exists." } }, required: ["path"] }
                },
                {
                  name: "createProjectFolder",
                  description: "Create a project folder structure with optional subfolders and starter files.",
                  parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING, description: "Project root folder path." }, subfolders: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of subfolder names." }, scaffold_standard: { type: Type.BOOLEAN, description: "Create src, tests, docs subfolders." }, files: { type: Type.OBJECT, description: "Object of relative-path -> content for starter files." } }, required: ["path"] }
                },
                {
                  name: "runPythonScript",
                  description: "Execute a Python script and capture stdout, stderr, and exit code. Has a configurable timeout.",
                  parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING, description: "Script path." }, args: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Script arguments." }, timeout: { type: Type.INTEGER, description: "Timeout in seconds (default 30)." } }, required: ["path"] }
                },
                {
                  name: "systemInfo",
                  description: "Get system resource usage: CPU %, RAM %, disk usage, uptime, OS info.",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
                {
                  name: "gpuInfo",
                  description: "Get NVIDIA GPU stats: utilization %, VRAM usage, temperature. Graceful fallback if no NVIDIA GPU.",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
                {
                  name: "temperatureInfo",
                  description: "Get available temperature readings (CPU, GPU, etc.). Best-effort on Windows.",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
                // --- V2: Brightness control ---
                {
                  name: "brightnessUp",
                  description: "Increase screen brightness by a step (default 10%). Use when user says 'increase brightness' or 'make screen brighter'.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      amount: { type: Type.NUMBER, description: "Percentage to increase (default 10)." }
                    }
                  }
                },
                {
                  name: "brightnessDown",
                  description: "Decrease screen brightness by a step (default 10%). Use when user says 'decrease brightness' or 'dim screen'.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      amount: { type: Type.NUMBER, description: "Percentage to decrease (default 10)." }
                    }
                  }
                },
                {
                  name: "setBrightness",
                  description: "Set screen brightness to an exact level. Use when user says 'set brightness to 50%' or 'brightness 80'.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      percent: { type: Type.NUMBER, description: "Target brightness 0-100." }
                    },
                    required: ["percent"]
                  }
                },
                // --- V2: Windows auto-start management ---
                {
                  name: "enableAutoStart",
                  description: "Enable AKARI to launch automatically when Windows starts. Creates a silent startup entry.",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
                {
                  name: "disableAutoStart",
                  description: "Disable AKARI auto-start on Windows login. Removes the startup entry.",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
                {
                  name: "getAutoStartStatus",
                  description: "Check whether AKARI is currently configured to auto-start on Windows login.",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
                // --- V3: Terminal and Package execution ---
                {
                  name: "requestTerminalAction",
                  description: "FIRST STEP for terminal commands or package installation. Generates a confirmation token. Tell the user verbally, then call the execution tool if they confirm.",
                  parameters: { type: Type.OBJECT, properties: { command: { type: Type.STRING, description: "Terminal command to run." }, package: { type: Type.STRING, description: "Package name to install." } } }
                },
                {
                  name: "runTerminalCommand",
                  description: "SECOND STEP: execute a previously-confirmed terminal command. Requires a valid execute_token from requestTerminalAction.",
                  parameters: { type: Type.OBJECT, properties: { command: { type: Type.STRING, description: "The confirmed bash command." }, execute_token: { type: Type.STRING, description: "Confirmation token from requestTerminalAction." } }, required: ["command", "execute_token"] }
                },
                {
                  name: "isCommandAllowed",
                  description: "Checks whether a terminal command is allowed by the security blacklist before running. Use to validate a command before execution.",
                  parameters: { type: Type.OBJECT, properties: { command: { type: Type.STRING, description: "The terminal command to check." } }, required: ["command"] }
                },
                {
                  name: "installPackage",
                  description: "SECOND STEP: install a package using pacman. Requires a valid execute_token from requestTerminalAction.",
                  parameters: { type: Type.OBJECT, properties: { package: { type: Type.STRING, description: "The confirmed package name." }, execute_token: { type: Type.STRING, description: "Confirmation token from requestTerminalAction." } }, required: ["package", "execute_token"] }
                },
                // --- V4: Browser vision + IITM + self-close ---
                {
                  name: "desktopBrowserReadText",
                  description: "Read the visible text content of the current page in the desktop automation browser. Use when user asks 'what does this page say' or 'read this page'.",
                  parameters: { type: Type.OBJECT, properties: { max_chars: { type: Type.INTEGER, description: "Max chars to return (default 4000)." } } }
                },
                {
                  name: "desktopBrowserGetLinks",
                  description: "Extract all visible hyperlinks from the current page in the desktop automation browser.",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
                {
                  name: "iitmQuickLinks",
                  description: "List all available IITM BS Degree quick links (portal, course dashboard, Acegrade, notes, etc.).",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
                {
                  name: "iitmOpen",
                  description: "Open an IITM BS Degree resource by name. Available: portal, course, academics, qualifier, exams, acegrade, mlt_notes, pdsa_notes, pdsa_notes_community, community_notes, mlt_github, portal_login.",
                  parameters: { type: Type.OBJECT, properties: { resource: { type: Type.STRING, description: "Resource key name." } }, required: ["resource"] }
                },
                {
                  name: "iitmOpenCustom",
                  description: "Open a custom IITM URL in the system browser.",
                  parameters: { type: Type.OBJECT, properties: { url: { type: Type.STRING, description: "URL to open." } }, required: ["url"] }
                },
                {
                  name: "shutdownAkari",
                  description: "Gracefully shut down AKARI agent and server. Use only when user explicitly asks to close AKARI. Requires confirmation token from requestTerminalAction.",
                  parameters: { type: Type.OBJECT, properties: { execute_token: { type: Type.STRING, description: "Confirmation token from requestTerminalAction." } }, required: ["execute_token"] }
                },
                {
                  name: "getWeather",
                  description: "Get current weather for a location. Use when user asks about weather, temperature, or climate.",
                  parameters: { type: Type.OBJECT, properties: { location: { type: Type.STRING, description: "City name (e.g. 'Mumbai', 'Delhi', 'New York')." } }, required: ["location"] }
                },
                {
                  name: "switchWorkspace",
                  description: "Switch to a specific Hyprland workspace by number. Use when user says 'go to workspace 3' or 'switch to workspace 1'.",
                  parameters: { type: Type.OBJECT, properties: { workspace: { type: Type.STRING, description: "Workspace number or name (e.g. '3', 'special:scratchpad')." } }, required: ["workspace"] }
                },
                {
                  name: "listWorkspaces",
                  description: "List all available Hyprland workspaces with their IDs.",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
                {
                  name: "moveToWorkspace",
                  description: "Move the active window to a different Hyprland workspace.",
                  parameters: { type: Type.OBJECT, properties: { workspace: { type: Type.STRING, description: "Target workspace number." } }, required: ["workspace"] }
                },
                {
                  name: "getNews",
                  description: "Get top news headlines. Supports categories: top, tech, world, india, sports, business.",
                  parameters: { type: Type.OBJECT, properties: { category: { type: Type.STRING, description: "News category: 'top', 'tech', 'world', 'india', 'sports', 'business'." }, count: { type: Type.INTEGER, description: "Number of headlines (max 15, default 5)." } } }
                },
                {
                  name: "exportConversation",
                  description: "Save the current conversation to a text file on disk. Call this when the user says 'save this conversation', 'baat save kar', 'export chat'. Pass the full conversation text that you have from context.",
                  parameters: { type: Type.OBJECT, properties: { text: { type: Type.STRING, description: "Full conversation text to save." }, filename: { type: Type.STRING, description: "Optional filename (default auto-generated with timestamp)." } }, required: ["text"] }
                },
                {
                  name: "listExports",
                  description: "List all previously saved conversation export files.",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
                // ── Google Calendar, Gmail, Tasks ──
                {
                  name: "getCalendarEvents",
                  description: "List upcoming Google Calendar events. Use when user asks 'what's on my calendar', 'mera schedule bata', 'upcoming events'.",
                  parameters: { type: Type.OBJECT, properties: { max_results: { type: Type.INTEGER, description: "Number of events (default 10)." }, days_ahead: { type: Type.INTEGER, description: "Days ahead to check (default 7)." }, show_all: { type: Type.BOOLEAN, description: "Include full details (default false)." } } }
                },
                {
                  name: "createCalendarEvent",
                  description: "Create a Google Calendar event. Use when user says 'meeting schedule kar', 'event bana', 'reminder add kar'.",
                  parameters: { type: Type.OBJECT, properties: { summary: { type: Type.STRING, description: "Event title (required)." }, start_time: { type: Type.STRING, description: "Start time in ISO format, e.g. '2026-07-24T14:00:00'." }, end_time: { type: Type.STRING, description: "End time in ISO format." }, description: { type: Type.STRING, description: "Event description." }, location: { type: Type.STRING, description: "Event location." }, attendees: { type: Type.STRING, description: "Comma-separated email addresses." } }, required: ["summary"] }
                },
                {
                  name: "getTasks",
                  description: "List tasks from Google Tasks. Use when user asks 'meri tasks dikha', 'to-do list bata', 'what tasks do I have'.",
                  parameters: { type: Type.OBJECT, properties: { tasklist: { type: Type.STRING, description: "Task list name (default 'My Tasks')." }, max_results: { type: Type.INTEGER, description: "Max tasks (default 10)." }, show_completed: { type: Type.BOOLEAN, description: "Include completed tasks (default false)." } } }
                },
                {
                  name: "createTask",
                  description: "Create a task in Google Tasks. Use when user says 'task add kar', 'reminder set kar', 'ek kaam yaad rakh'.",
                  parameters: { type: Type.OBJECT, properties: { title: { type: Type.STRING, description: "Task title (required)." }, notes: { type: Type.STRING, description: "Task description." }, due: { type: Type.STRING, description: "Due date in ISO format, e.g. '2026-07-30'." }, tasklist: { type: Type.STRING, description: "Task list name (default 'My Tasks')." } }, required: ["title"] }
                },
                {
                  name: "cameraList",
                  description: "List available webcam devices on this computer. Use when the user asks what cameras are available or before turning a camera on.",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
                {
                  name: "cameraOn",
                  description: "Turn the webcam ON in a floating viewer window without disturbing the tiling layout of other windows. Use when user says 'camera on karo', 'webcam chalao', 'kamera kholo'. Optionally pass a specific device.",
                  parameters: { type: Type.OBJECT, properties: { device: { type: Type.STRING, description: "Camera device path, e.g. '/dev/video0'. Defaults to the first camera found." } } }
                },
                {
                  name: "cameraOff",
                  description: "Turn the webcam OFF and free the device for other applications. Use when user says 'camera band karo', 'webcam band karo'.",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
                // ── PowerPoint & Presentation Creation ──
                {
                  name: "createPresentation",
                  description: "Generate a complete, professionally formatted multi-slide PowerPoint presentation (.pptx) with modern themes, title, structured bullet points, speaker notes, and auto-open it in Microsoft PowerPoint. Use when user says 'make a ppt', 'presentation banao', 'create slides on X'.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      topic: { type: Type.STRING, description: "The presentation subject or topic." },
                      title: { type: Type.STRING, description: "Main presentation title." },
                      subtitle: { type: Type.STRING, description: "Subtitle or author tagline." },
                      slides: {
                        type: Type.ARRAY,
                        description: "List of slide objects. Each object should have 'title' (string), 'points' (array of bullet string points), and optional 'layout' ('content' or 'two_column') and 'notes' (speaker notes).",
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            title: { type: Type.STRING },
                            points: { type: Type.ARRAY, items: { type: Type.STRING } },
                            layout: { type: Type.STRING, enum: ["content", "two_column"] },
                            notes: { type: Type.STRING }
                          },
                          required: ["title", "points"]
                        }
                      },
                      theme: {
                        type: Type.STRING,
                        description: "Theme styling palette: 'modern_dark', 'cyber_cyan', 'minimal_white', 'corporate_blue', 'sunset_gradient', 'emerald_green'.",
                        enum: ["modern_dark", "cyber_cyan", "minimal_white", "corporate_blue", "sunset_gradient", "emerald_green"]
                      },
                      filename: { type: Type.STRING, description: "Optional output filename (e.g. 'AI_Overview.pptx')." },
                      save_folder: { type: Type.STRING, description: "Target folder: 'desktop' (default), 'documents', or custom folder." },
                      open_after: { type: Type.BOOLEAN, description: "Whether to open the presentation in PowerPoint immediately (default true)." }
                    },
                    required: ["topic"]
                  }
                },
                {
                  name: "openPowerPoint",
                  description: "Open Microsoft PowerPoint or view a specific .pptx presentation file. Use when user says 'open PowerPoint', 'open my presentation', 'show my PPT'.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      file_path: { type: Type.STRING, description: "Optional specific .pptx file path or filename to open in PowerPoint." }
                    }
                  }
                },
                {
                  name: "readPresentation",
                  description: "Read, inspect, and summarize all slides, titles, and text contents of an existing PowerPoint (.pptx) file.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      file_path: { type: Type.STRING, description: "Path or filename of the .pptx presentation to read." }
                    },
                    required: ["file_path"]
                  }
                },
                {
                  name: "addSlideToPresentation",
                  description: "Append new slides with title and bullet points to an existing .pptx presentation.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      file_path: { type: Type.STRING, description: "Path to the existing .pptx file." },
                      title: { type: Type.STRING, description: "Title for the new slide." },
                      points: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Bullet points for the new slide." }
                    },
                    required: ["file_path", "title", "points"]
                  }
                },
                // ── Office Suite: Excel & Word Documents ──
                {
                  name: "createExcelSpreadsheet",
                  description: "Create an Excel spreadsheet (.xlsx) with headers, rows of data, financial tables, and auto-open it in Microsoft Excel. Use when user says 'make an excel sheet', 'excel spreadsheet banao', 'create budget spreadsheet'.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING, description: "Title or subject of the spreadsheet." },
                      sheet_name: { type: Type.STRING, description: "Worksheet name (default 'Data')." },
                      headers: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of column header names." },
                      rows: { type: Type.ARRAY, items: { type: Type.ARRAY, items: { type: Type.STRING } }, description: "2D Array of rows containing cells." },
                      filename: { type: Type.STRING, description: "Optional output filename (e.g. 'Revenue_2026.xlsx')." },
                      save_folder: { type: Type.STRING, description: "Target folder: 'desktop' (default), 'documents', or custom folder." },
                      open_after: { type: Type.BOOLEAN, description: "Whether to open in Excel immediately (default true)." }
                    }
                  }
                },
                {
                  name: "verifySpeakerVoice",
                  description: "Verify if the current live speaker's acoustic voiceprint matches Siddhant (Owner) or if someone else is speaking. Returns match confidence %, detected pitch (Hz), and verified speaker identity.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {}
                  }
                },
                {
                  name: "createDocument",
                  description: "Generate a formatted Word document (.docx) or professional report with headers, bullet points, and auto-open it in Microsoft Word. Use when user says 'write a document', 'create report on X', 'doc banao'.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING, description: "Main document title." },
                      subtitle: { type: Type.STRING, description: "Document subtitle or author." },
                      sections: {
                        type: Type.ARRAY,
                        description: "List of sections with 'heading' and 'content' or 'points'.",
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            heading: { type: Type.STRING },
                            content: { type: Type.STRING },
                            points: { type: Type.ARRAY, items: { type: Type.STRING } }
                          }
                        }
                      },
                      filename: { type: Type.STRING, description: "Optional filename (e.g. 'Project_Proposal.docx')." },
                      save_folder: { type: Type.STRING, description: "Target folder: 'desktop' (default), 'documents'." },
                      open_after: { type: Type.BOOLEAN, description: "Whether to open in Word immediately (default true)." }
                    },
                    required: ["title"]
                  }
                },
                {
                  name: "expressInnerThought",
                  description: "Silently display an inner thought, mental reasoning, or reflection in the user's on-screen holographic thought bubble. This tool is 100% SILENT and is NEVER spoken aloud. Call this whenever you want to think, reflect, or plan before/while replying.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      thought: {
                        type: Type.STRING,
                        description: "The concise inner thought or reasoning to display visually in the thought bubble."
                      }
                    },
                    required: ["thought"]
                  }
                },
                {
                  name: "analyzeData",
                  description: "Perform statistical analysis on a dataset (CSV, JSON, TSV). Computes summary statistics (mean, median, stdev, quartiles, min/max), column null percentages, unique categories, correlations, and automatic insights.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      file_path: {
                        type: Type.STRING,
                        description: "Path to the dataset file (e.g. 'C:/Users/.../sales.csv' or 'data.json')."
                      }
                    },
                    required: ["file_path"]
                  }
                },
                {
                  name: "createDataChart",
                  description: "Generate an analytical SVG chart (bar chart or line chart) from data labels and numerical values, saving it to Desktop or workspace.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING, description: "Title of the chart." },
                      chart_type: { type: Type.STRING, description: "Type of chart: 'bar' or 'line'." },
                      labels: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Labels for each data point or category." },
                      values: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "Numerical values for each data point." },
                      save_folder: { type: Type.STRING, description: "Folder to save chart: 'desktop' or 'workspace'." }
                    },
                    required: ["title", "labels", "values"]
                  }
                },
                {
                  name: "sendEmail",
                  description: "Send an email or create an email draft. Supports direct sending via Gmail API/SMTP or opens Gmail web compose/default mail client with recipient, subject, and body pre-filled. Use when user says 'send email to X', 'email bhej de', 'write email to X'.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      to: { type: Type.STRING, description: "Recipient email address (e.g. 'alex@example.com')." },
                      subject: { type: Type.STRING, description: "Subject of the email." },
                      body: { type: Type.STRING, description: "Main message body content." },
                      cc: { type: Type.STRING, description: "Optional CC email address." }
                    },
                    required: ["to", "subject", "body"]
                  }
                },
                {
                  name: "getEmails",
                  description: "Fetch and read recent emails from the user's Gmail inbox. Use when user says 'check my emails', 'read inbox', 'koi email aaya kya'.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      max_results: { type: Type.INTEGER, description: "Number of emails to return (default 5, max 20)." },
                      query: { type: Type.STRING, description: "Optional search query filter." }
                    }
                  }
                }
              ]
            }
          ]
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
              return;
            }

            // Process all parts in the turn (audio chunks and text chunks)
            const parts = message.serverContent?.modelTurn?.parts || [];
            for (const part of parts) {
              // Audio Stream Chunk (model response audio play, 24kHz raw PCM)
              if (part.inlineData?.data) {
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
              
              if (currentModelResponseText.trim()) {
                dialogueHistory.push({ role: "model", text: currentModelResponseText });
                currentModelResponseText = "";
              }

              // Fire asynchronous memory extraction periodically after meaningful dialogue accumulation
              if (dialogueHistory.length >= 6) {
                (async () => {
                  try {
                    const sliceToProcess = [...dialogueHistory];
                    dialogueHistory.length = 0; // reset buffer to avoid re-processing same turns
                    const updated = await processConversationSlice(apiKey, sliceToProcess);
                    if (updated) {
                      console.log("[Memory Sync] Sending refreshed memory list to client.");
                      clientWs.send(JSON.stringify({ type: "memory_sync", memories: updated }));
                    }
                  } catch (err) {
                    console.error("[Memory Sync] Error running background consolidation:", err);
                  }
                })();
              }
            }

            // User input transcription (user speech text translated by Gemini)
            const userTextOutput = (message.serverContent as any)?.userTurn?.parts?.[0]?.text;
            if (userTextOutput) {
              clientWs.send(JSON.stringify({ type: "transcription", role: "user", text: userTextOutput }));
              dialogueHistory.push({ role: "user", text: userTextOutput });
            }

            // Function Calls (Gemini requesting server/client tool execution)
            if (message.toolCall?.functionCalls && message.toolCall.functionCalls.length > 0) {
              const calls = message.toolCall.functionCalls;
              (async () => {
                const functionResponses: any[] = [];
                await Promise.all(
                  calls.map(async (fc) => {
                    const fnName = fc.name;
                    if (!fnName) return;
                    console.log(`[Function Call]: ${fnName}`, fc.args);

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
                        clientWs.send(JSON.stringify({ type: "shutdown" }));
                        functionResponses.push({
                          name: fnName,
                          response: { output: { result: "Akari is shutting down gracefully." } },
                          id: fc.id
                        });
                        setTimeout(() => {
                          console.log("[Server] Graceful shutdown requested by voice command.");
                          process.exit(0);
                        }, 2000);
                      } else if (DESKTOP_TOOLS.has(fnName)) {
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
              e?.code === 1008;   // Policy violation / duration limit abort

            if (isDurationRollover) {
              console.log("[Gemini Live] Session duration rollover detected. Triggering silent client reconnect...");
              clientWs.send(JSON.stringify({ type: "status", status: "session_closed", reason: "session_duration_limit" }));
              return;
            }

            if (e?.reason && e.reason !== "none") {
              clientWs.send(JSON.stringify({ 
                type: "error", 
                error: `Gemini Live: ${e.reason}` 
              }));
            }
            clientWs.send(JSON.stringify({ type: "status", status: "session_closed", reason: e?.reason }));
          },
          onerror: (error: any) => {
            console.error("[Gemini Live Error]:", error);
            const errStr = String(error?.message || error || "");
            if (
              errStr.toLowerCase().includes("goaway") ||
              errStr.toLowerCase().includes("session duration") ||
              errStr.toLowerCase().includes("duration limit")
            ) {
              console.log("[Gemini Live] Intercepted session duration notice in onerror. Silently cycling...");
              clientWs.send(JSON.stringify({ type: "status", status: "session_closed", reason: "session_duration_limit" }));
              return;
            }
            clientWs.send(JSON.stringify({ 
              type: "error", 
              error: `Gemini API Error: ${error?.message || String(error)}` 
            }));
          }
        }
      });
      
      clientWs.send(JSON.stringify({ type: "status", status: "connected" }));
      console.log("[Gemini Connect] Session established successfully");
      
      clientWs.on("message", (rawMsg) => {
        try {
          const msg = JSON.parse(rawMsg.toString());
          if (msg.audio) {
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
