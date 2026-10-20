import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const currentFilePath = (typeof import.meta !== "undefined" && import.meta?.url) 
  ? fileURLToPath(import.meta.url) 
  : (typeof __filename !== "undefined" ? __filename : path.join(process.cwd(), "server.cjs"));
const currentDirPath = typeof __dirname !== "undefined" ? __dirname : path.dirname(currentFilePath);
const LOGS_DIR = path.join(currentDirPath, "logs");
const TIMINGS_LOG_FILE = path.join(LOGS_DIR, "turn_timings.log");
const TIMINGS_JSON_FILE = path.join(LOGS_DIR, "turn_timings.json");

try {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
} catch {}

export interface TurnTiming {
  turnId: number;
  timestamp: string;
  stageA_endOfSpeechMs: number;          // a. User stops speaking > end of speech detected
  stageB_geminiTTFTMs: number;           // b. Audio sent > first response from Gemini
  stageC_toolsMs: Record<string, number>; // c. Gemini asks for a tool > tool result returned
  stageD_audioPlaybackMs: number;        // d. First audio of the reply arrives > starts playing
  stageE_memoryExtractionMs: number | null; // e. Memory extraction start and end
  stageF_systemPromptChars: number;      // f. Size of the system prompt
  stageF_systemPromptBytes: number;
  stageF_toolCount: number;              // f. Number of tool declarations sent
  totalTurnLatencyMs: number;
  longestStage: { stage: string; name: string; durationMs: number };
}

class TurnTimingTracker {
  private turns: TurnTiming[] = [];
  private currentTurnId = 0;
  private maxHistory = 20;

  // Active turn scratchpad
  private activeTurn: Partial<TurnTiming> | null = null;
  private lastUserAudioSentTime = 0;
  private lastUserSpeechEndedTime = 0;
  private speechEndLatencyEstimate = 450; // default VAD silence window fallback
  private firstAudioArrivedTime = 0;
  private currentToolStarts: Record<string, number> = {};
  private currentToolDurations: Record<string, number> = {};

  constructor() {
    this.loadHistory();
  }

  private loadHistory(): void {
    try {
      if (fs.existsSync(TIMINGS_JSON_FILE)) {
        const raw = fs.readFileSync(TIMINGS_JSON_FILE, "utf-8");
        this.turns = JSON.parse(raw);
        if (this.turns.length > 0) {
          this.currentTurnId = this.turns[this.turns.length - 1].turnId;
        }
      }
    } catch {
      this.turns = [];
    }
  }

  private persistHistory(): void {
    try {
      // Save last 20 turns JSON
      const last20 = this.turns.slice(-this.maxHistory);
      fs.writeFileSync(TIMINGS_JSON_FILE, JSON.stringify(last20, null, 2), "utf-8");
    } catch (e) {
      console.warn("[Timing Tracker] Error persisting JSON history:", e);
    }
  }

  /**
   * Called when audio chunk from user is forwarded to Gemini
   */
  public recordAudioSent(): void {
    this.lastUserAudioSentTime = Date.now();
  }

  /**
   * Called when client reports end of speech detection
   */
  public recordEndOfSpeech(latencyMs: number): void {
    this.speechEndLatencyEstimate = Math.max(latencyMs, 10);
    this.lastUserSpeechEndedTime = Date.now();
  }

  /**
   * Called when client reports audio playback started
   */
  public recordFirstAudioPlayback(latencyMs: number): void {
    if (this.activeTurn) {
      this.activeTurn.stageD_audioPlaybackMs = Math.round(latencyMs);
    }
  }

  /**
   * Start a new conversation turn when Gemini first replies or requests a tool
   */
  public startTurnIfPending(
    systemPromptChars: number,
    systemPromptBytes: number,
    toolCount: number
  ): void {
    if (!this.activeTurn) {
      this.currentTurnId++;
      const now = Date.now();
      const ttft = this.lastUserAudioSentTime > 0 ? Math.max(now - this.lastUserAudioSentTime, 150) : 1200;

      this.activeTurn = {
        turnId: this.currentTurnId,
        timestamp: new Date().toISOString(),
        stageA_endOfSpeechMs: Math.round(this.speechEndLatencyEstimate),
        stageB_geminiTTFTMs: Math.round(ttft),
        stageC_toolsMs: {},
        stageD_audioPlaybackMs: 25, // default initial render latency estimate
        stageE_memoryExtractionMs: null,
        stageF_systemPromptChars: systemPromptChars,
        stageF_systemPromptBytes: systemPromptBytes,
        stageF_toolCount: toolCount,
      };
      this.currentToolDurations = {};
      this.firstAudioArrivedTime = now;
    }
  }

  /**
   * Called when Gemini begins a tool call
   */
  public recordToolStart(toolName: string): void {
    this.currentToolStarts[toolName] = Date.now();
  }

  /**
   * Called when tool execution finishes
   */
  public recordToolEnd(toolName: string): number {
    const start = this.currentToolStarts[toolName] || Date.now();
    const duration = Date.now() - start;
    this.currentToolDurations[toolName] = duration;
    if (this.activeTurn) {
      this.activeTurn.stageC_toolsMs = { ...this.currentToolDurations };
    }
    return duration;
  }

  /**
   * Called when memory extraction runs
   */
  public recordMemoryExtraction(durationMs: number): void {
    if (this.activeTurn) {
      this.activeTurn.stageE_memoryExtractionMs = Math.round(durationMs);
    }
  }

  /**
   * Finalize the turn on turnComplete, calculate totals, print table, and append to log file
   */
  public completeTurn(): TurnTiming | null {
    if (!this.activeTurn) return null;

    const t = this.activeTurn as TurnTiming;
    t.stageC_toolsMs = { ...this.currentToolDurations };

    // Calculate tool total
    const toolTotal = Object.values(t.stageC_toolsMs).reduce((a, b) => a + b, 0);

    // Total turn latency until first speech
    t.totalTurnLatencyMs = Math.round(
      t.stageA_endOfSpeechMs + t.stageB_geminiTTFTMs + toolTotal + t.stageD_audioPlaybackMs
    );

    // Identify which stage took the longest
    const candidates = [
      { stage: "Stage a", name: "End of Speech Detection (VAD)", durationMs: t.stageA_endOfSpeechMs },
      { stage: "Stage b", name: "Gemini First Token/Audio (TTFT)", durationMs: t.stageB_geminiTTFTMs },
      { stage: "Stage c", name: "Tool Execution", durationMs: toolTotal },
      { stage: "Stage d", name: "Client Audio Playback Buffer", durationMs: t.stageD_audioPlaybackMs },
    ];
    candidates.sort((a, b) => b.durationMs - a.durationMs);
    t.longestStage = candidates[0];

    this.turns.push(t);
    if (this.turns.length > this.maxHistory) {
      this.turns = this.turns.slice(-this.maxHistory);
    }
    this.persistHistory();

    const tableStr = this.renderTable(t);
    console.log("\n" + tableStr + "\n");

    try {
      fs.appendFileSync(TIMINGS_LOG_FILE, tableStr + "\n\n", "utf-8");
    } catch (e) {
      console.warn("[Timing Tracker] Error appending to turn_timings.log:", e);
    }

    this.activeTurn = null;
    this.currentToolStarts = {};
    this.currentToolDurations = {};
    return t;
  }

  /**
   * Render an ASCII table for the turn
   */
  public renderTable(t: TurnTiming): string {
    const toolDetails = Object.keys(t.stageC_toolsMs).length > 0
      ? Object.entries(t.stageC_toolsMs).map(([k, v]) => `${k}: ${v}ms`).join(", ")
      : "None (Direct Voice Turn)";

    const memStr = t.stageE_memoryExtractionMs !== null
      ? `${t.stageE_memoryExtractionMs} ms (Background)`
      : "Not triggered this turn";

    const sep = "+------------------------------------------------------------------------------------------------+";
    const title = `|                                  AKARI CONVERSATION TURN #${String(t.turnId).padEnd(4)} TIMING                                |`;
    const header = "| Stage                                              | Duration (ms)     | Status / Details       |";

    const rows = [
      `| a. User stops speaking > End of speech detected    | ${String(t.stageA_endOfSpeechMs + " ms").padEnd(17)} | Silence Hangover       |`,
      `| b. Audio sent > First response from Gemini (TTFT)  | ${String(t.stageB_geminiTTFTMs + " ms").padEnd(17)} | Model Stream Latency   |`,
      `| c. Tool execution (Gemini ask > Result returned)   | ${String(Object.values(t.stageC_toolsMs).reduce((a,b)=>a+b,0) + " ms").padEnd(17)} | ${toolDetails.slice(0, 22).padEnd(22)} |`,
      `| d. First audio arrives > Audio playback starts     | ${String(t.stageD_audioPlaybackMs + " ms").padEnd(17)} | AudioBuffer Dispatch   |`,
      `| e. Memory extraction (Start > End)                 | ${String(memStr).slice(0, 17).padEnd(17)} | ${memStr.slice(0, 22).padEnd(22)} |`,
      `| f. System prompt size & Tool declarations          | ${String(t.stageF_systemPromptChars.toLocaleString() + " chars").padEnd(17)} | ${String(t.stageF_toolCount + " tools declared").padEnd(22)} |`,
    ];

    const longestStr = `LONGEST STAGE: ${t.longestStage.stage} (${t.longestStage.name}) -> ${t.longestStage.durationMs} ms`;
    const totalRow = `| TOTAL TURN LATENCY: ${String(t.totalTurnLatencyMs + " ms").padEnd(10)} | ${longestStr.padEnd(66)} |`;

    return [sep, title, sep, header, sep, ...rows, sep, totalRow, sep].join("\n");
  }

  public getHistory(): TurnTiming[] {
    return this.turns;
  }

  public getSummary(): {
    turnsCount: number;
    avgStageA: number;
    avgStageB: number;
    avgStageC: number;
    avgStageD: number;
    avgStageE: number;
    longestStageOverall: string;
  } {
    if (this.turns.length === 0) {
      return {
        turnsCount: 0,
        avgStageA: 0,
        avgStageB: 0,
        avgStageC: 0,
        avgStageD: 0,
        avgStageE: 0,
        longestStageOverall: "None",
      };
    }

    let sumA = 0, sumB = 0, sumC = 0, sumD = 0, sumE = 0, eCount = 0;
    for (const t of this.turns) {
      sumA += t.stageA_endOfSpeechMs;
      sumB += t.stageB_geminiTTFTMs;
      sumC += Object.values(t.stageC_toolsMs).reduce((a, b) => a + b, 0);
      sumD += t.stageD_audioPlaybackMs;
      if (t.stageE_memoryExtractionMs !== null) {
        sumE += t.stageE_memoryExtractionMs;
        eCount++;
      }
    }

    const n = this.turns.length;
    const avgA = Math.round(sumA / n);
    const avgB = Math.round(sumB / n);
    const avgC = Math.round(sumC / n);
    const avgD = Math.round(sumD / n);
    const avgE = eCount > 0 ? Math.round(sumE / eCount) : 0;

    const stages = [
      { name: "Stage a (End of speech detection)", avg: avgA },
      { name: "Stage b (Audio sent > first Gemini response TTFT)", avg: avgB },
      { name: "Stage c (Tool execution)", avg: avgC },
      { name: "Stage d (Audio arrival > playback start)", avg: avgD },
    ];
    stages.sort((x, y) => y.avg - x.avg);

    return {
      turnsCount: n,
      avgStageA: avgA,
      avgStageB: avgB,
      avgStageC: avgC,
      avgStageD: avgD,
      avgStageE: avgE,
      longestStageOverall: stages[0].name,
    };
  }
}

export const timingTracker = new TurnTimingTracker();
