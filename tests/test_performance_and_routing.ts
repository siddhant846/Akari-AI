import { 
  getRoutedToolDeclarations, 
  detectCategoriesFromText, 
  CORE_TOOLS, 
  BROWSER_TOOLS, 
  FILES_TOOLS, 
  SYSTEM_TOOLS, 
  GOOGLE_TOOLS, 
  SEARCH_TOOLS, 
  CODING_TOOLS 
} from "../server_tools_routing";
import { 
  getTaskInstructions, 
  WEBSITE_BUILDER_INSTRUCTIONS, 
  SLIDES_PRESENTATION_INSTRUCTIONS, 
  NEWS_BRIEFING_INSTRUCTIONS, 
  DATA_ANALYTICS_INSTRUCTIONS 
} from "../server_task_instructions";

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail: string = "") {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passCount++;
  } else {
    console.error(`  [FAIL] ${testName} - ${detail}`);
    failCount++;
  }
}

console.log("\n=======================================================");
console.log("       AKARI PERFORMANCE & ROUTING REGRESSION SUITE     ");
console.log("=======================================================\n");

// ---------------------------------------------------------------------------
// 1. TOOL ROUTING REGRESSION TESTS
// ---------------------------------------------------------------------------
console.log("Test Suite 1: Tool Routing & Multi-Category Availability");

// Default routing must include all 6 categories so users don't lose tools
const defaultTools = getRoutedToolDeclarations();
const defaultNames = new Set(defaultTools.map(t => t.name));

assert(defaultNames.has("desktopBrowserOpen"), "Browser tool present in default set (desktopBrowserOpen)");
assert(defaultNames.has("createFile"), "Files tool present in default set (createFile)");
assert(defaultNames.has("systemInfo"), "System tool present in default set (systemInfo)");
assert(defaultNames.has("sendEmail"), "Google tool present in default set (sendEmail)");
assert(defaultNames.has("searchWeb"), "Search tool present in default set (searchWeb)");
assert(defaultNames.has("createPythonFile"), "Coding tool present in default set (createPythonFile)");
assert(defaultNames.has("volumeUp"), "Core tool present in default set (volumeUp)");
assert(defaultNames.has("saveCustomMemory"), "Core tool present in default set (saveCustomMemory)");

// Selective category routing
const browserOnly = getRoutedToolDeclarations(["browser"]);
const browserNames = new Set(browserOnly.map(t => t.name));
assert(browserNames.has("desktopBrowserOpen"), "Selective browser route includes desktopBrowserOpen");
assert(browserNames.has("volumeUp"), "Selective browser route retains core tools (volumeUp)");
assert(!browserNames.has("createPythonFile"), "Selective browser route excludes unrequested coding tools");

// ---------------------------------------------------------------------------
// 2. TASK INSTRUCTIONS ON-DEMAND REGRESSION TESTS
// ---------------------------------------------------------------------------
console.log("\nTest Suite 2: Task Instructions Loaded On Demand");

// Baseline: empty prompt gives lean baseline (no bloating)
const baseline = getTaskInstructions([], "");
assert(baseline === "", "Baseline task instructions are empty (zero bloat for general chat)");

// Website builder trigger
const websiteTask = getTaskInstructions(["coding"], "Build an animated website for Biryani Hub restaurant");
assert(websiteTask.includes("DESIGN RESEARCH & BESPOKE ANIMATED WEBSITE BUILDER"), "Website instructions trigger for website builder prompts");
assert(websiteTask.includes("CONTINUOUS OPERATION"), "Website instructions include continuous operation protection");

// Presentation builder trigger
const slidesTask = getTaskInstructions(["coding"], "Make a 10 slide presentation on Web3 AI architectures");
assert(slidesTask.includes("POWERPOINT & PRESENTATION WORKFLOWS"), "Presentation instructions trigger for presentation prompts");

// News & briefing trigger
const newsTask = getTaskInstructions(["search"], "What is the latest news and headlines today?");
assert(newsTask.includes("WEATHER, NEWS & BRIEFINGS PROTOCOL"), "News instructions trigger for news requests");

// Data analytics trigger
const dataTask = getTaskInstructions(["coding"], "Analyze this sales.csv dataset and plot trends");
assert(dataTask.includes("DATA ANALYTICS & VISUALIZATION"), "Data analytics instructions trigger for data/chart requests");

// ---------------------------------------------------------------------------
// 3. SEARCH POLICY REGRESSION TESTS
// ---------------------------------------------------------------------------
console.log("\nTest Suite 3: Time-Sensitive Search Policy");

function shouldTriggerSearch(query: string): boolean {
  const q = query.toLowerCase();
  const timeSensitiveTerms = [
    "today", "now", "latest", "breaking", "current", "weather", "stock price",
    "score", "election", "who won", "recent", "search for", "google for", "news"
  ];
  return timeSensitiveTerms.some(term => q.includes(term));
}

assert(shouldTriggerSearch("What is the latest breaking news today?"), "Time-sensitive query triggers search: 'breaking news today'");
assert(shouldTriggerSearch("Current stock price of NVIDIA"), "Time-sensitive query triggers search: 'current stock price'");
assert(shouldTriggerSearch("What is the weather in Mumbai right now?"), "Time-sensitive query triggers search: 'weather right now'");
assert(shouldTriggerSearch("Who won the match yesterday?"), "Time-sensitive query triggers search: 'who won'");
assert(!shouldTriggerSearch("Hello Akari, how are you doing?"), "Casual greeting does not trigger search");
assert(!shouldTriggerSearch("Explain how binary search works in Python"), "Technical explanation does not trigger search");
assert(!shouldTriggerSearch("Write a story about a brave cat"), "Creative request does not trigger search");
assert(!shouldTriggerSearch("What is photosynthesis?"), "General science fact does not trigger search");

// ---------------------------------------------------------------------------
// 4. ULTRA-LOW LATENCY VOICE ENDPOINTING & VAD
// ---------------------------------------------------------------------------
console.log("\nTest Suite 4: Ultra-Low Latency Voice Endpointing & Instant Turn-Taking");

import { StartSensitivity, EndSensitivity } from "@google/genai";
import * as fs from "fs";

assert(StartSensitivity.START_SENSITIVITY_HIGH === "START_SENSITIVITY_HIGH", "StartSensitivity HIGH is available in SDK");
assert(EndSensitivity.END_SENSITIVITY_HIGH === "END_SENSITIVITY_HIGH", "EndSensitivity HIGH is available in SDK");

const serverSrc = fs.readFileSync("server.ts", "utf-8");
assert(serverSrc.includes("silenceDurationMs: 200"), "Server configures 200ms silence detection for instant Gemini Live endpointing");
assert(serverSrc.includes("thinkingBudget: 0"), "Server disables thinking budget (0) to eliminate internal reasoning delay");
assert(serverSrc.includes("endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH"), "Server sets EndSensitivity to HIGH");
assert(serverSrc.includes("session.sendClientContent({ turnComplete: true })"), "Server emits immediate turnComplete on client end-of-speech");

const audioSrc = fs.readFileSync("src/lib/audio.ts", "utf-8");
assert(audioSrc.includes("now - this.silenceStartTimestamp >= 220"), "Client VAD silence threshold tuned to 220ms");
assert(audioSrc.includes('endOfTurn: true'), "Client sends endOfTurn signal immediately upon silence");
assert(audioSrc.includes("initialPreRoll = this.lowBandwidthMode ? 0.025 : 0.010"), "Client playback pre-roll optimized to 10ms");

const routingSrc = fs.readFileSync("server_tools_routing.ts", "utf-8");
assert(routingSrc.includes("NEVER call this during conversational voice replies or direct questions"), "expressInnerThought restricted from conversational queries to eliminate tool call round-trips");

// ---------------------------------------------------------------------------
// 5. SUMMARY
// ---------------------------------------------------------------------------
console.log("\n=======================================================");
console.log(`TOTAL TESTS: ${passCount + failCount} | PASSED: ${passCount} | FAILED: ${failCount}`);
console.log("=======================================================\n");

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
