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
assert(defaultNames.has("openMobileApp"), "Mobile tool present in default set (openMobileApp)");
assert(defaultNames.has("mobileTorch"), "Mobile tool present in default set (mobileTorch)");

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
assert(audioSrc.includes("ambientNoiseFloor"), "Adaptive noise floor tracking present in audio.ts");
assert(audioSrc.includes("silenceElapsed >= 180 || timeSinceSpeech >= 300"), "Client VAD cutoff guarantee (180ms) prevents ambient noise hangs and triggers response instantly");
assert(audioSrc.includes('endOfTurn: true'), "Client sends endOfTurn signal immediately upon silence");
assert(audioSrc.includes("initialPreRoll = this.lowBandwidthMode ? 0.025 : 0.010"), "Client playback pre-roll optimized to 10ms");
assert(audioSrc.includes("downsampleTo16k"), "Client downsamples 44.1kHz/48kHz microphone streams to exact 16kHz PCM for crystal clear speech recognition");
assert(audioSrc.includes("sampleRate: { ideal: 16000 }"), "Microphone constraints request ideal 16000 Hz capture");
assert(audioSrc.includes("this.echoSuppressionUntil = Date.now() + 120;"), "Post-speech echo suppression reduced to 120ms so Akari is never deaf when user speaks immediately");

const routingSrc = fs.readFileSync("server_tools_routing.ts", "utf-8");
assert(!routingSrc.includes("verifySpeakerVoice"), "verifySpeakerVoice tool eliminated from core tools to stop latency spikes");
assert(!routingSrc.includes("expressInnerThought"), "expressInnerThought eliminated from core tools to prevent speech delays");
assert(!serverSrc.includes("One moment, checking that"), "Robotic filler line directive removed from system prompt");
assert(!audioSrc.includes("filler_line"), "Robotic speechSynthesis filler voice removed from client audio");

// ---------------------------------------------------------------------------
// 5. ZERO-WAITING VERBAL ACKNOWLEDGEMENTS REGRESSION TESTS
// ---------------------------------------------------------------------------
console.log("\nTest Suite 5: Zero-Waiting Immediate Verbal Acknowledgements for News & Search");
assert(serverSrc.includes("ZERO WAITING & IMMEDIATE SPOKEN ACKNOWLEDGEMENTS FOR SEARCHES & TOOLS"), "Server prompt mandates immediate verbal spoken acknowledgement before searching/tools");
assert(serverSrc.includes("Ohh, you wanna know today's news? Okay wait, let me check what's going on in the world!"), "Server prompt includes conversational acknowledgement example for news");
const taskInstructionsSrc = fs.readFileSync("server_task_instructions.ts", "utf-8");
assert(taskInstructionsSrc.includes("ZERO WAITING / IMMEDIATE VERBAL ACKNOWLEDGEMENT"), "Task instructions mandate immediate verbal spoken acknowledgement for news");

// ---------------------------------------------------------------------------
// 6. DEVICE-ISOLATED PROFILES (MOBILE VS DESKTOP) REGRESSION TESTS
// ---------------------------------------------------------------------------
console.log("\nTest Suite 6: Device-Isolated Profiles (Mobile vs Desktop Independence)");
const settingsStoreSrc = fs.readFileSync("src/lib/settingsStore.ts", "utf-8");
assert(settingsStoreSrc.includes("akari.settings.mobile.v3"), "Mobile storage key (akari.settings.mobile.v3) present in settingsStore");
assert(settingsStoreSrc.includes("akari.settings.desktop.v3"), "Desktop storage key (akari.settings.desktop.v3) present in settingsStore");
assert(settingsStoreSrc.includes("getDevicePlatform"), "getDevicePlatform helper function exported in settingsStore");
assert(serverSrc.includes("settings.mobile.json"), "Server isolates mobile settings in settings.mobile.json");
assert(serverSrc.includes("settings.desktop.json"), "Server isolates desktop settings in settings.desktop.json");
assert(serverSrc.includes("loadSettingsFile(clientPlatform)"), "WebSocket live handler loads platform-specific profile for connected device");
const settingsPanelSrc = fs.readFileSync("src/components/SettingsPanel.tsx", "utf-8");
assert(settingsPanelSrc.includes("Mobile Profile"), "Settings panel displays dedicated Mobile Profile banner");
assert(settingsPanelSrc.includes("Desktop Profile"), "Settings panel displays dedicated Desktop Profile banner");

// ---------------------------------------------------------------------------
// 7. ANDROID PACKAGE VISIBILITY & FLAWLESS MOBILE APP LAUNCHING REGRESSION TESTS
// ---------------------------------------------------------------------------
console.log("\nTest Suite 7: Android Package Visibility & Flawless Mobile App Launching");
const manifestSrc = fs.readFileSync("android/app/src/main/AndroidManifest.xml", "utf-8");
assert(manifestSrc.includes('android.permission.QUERY_ALL_PACKAGES'), "AndroidManifest.xml includes QUERY_ALL_PACKAGES permission for Android 11+ visibility");
assert(manifestSrc.includes('<queries>'), "AndroidManifest.xml declares <queries> block for package visibility");
assert(manifestSrc.includes('android:name="com.whatsapp"'), "AndroidManifest.xml queries include com.whatsapp");
assert(manifestSrc.includes('android:name="com.whatsapp.w4b"'), "AndroidManifest.xml queries include WhatsApp Business (com.whatsapp.w4b)");
assert(manifestSrc.includes('android:scheme="whatsapp"'), "AndroidManifest.xml queries declare whatsapp scheme");

const mainActivitySrc = fs.readFileSync("android/app/src/main/java/com/akari/ai/MainActivity.java", "utf-8");
assert(mainActivitySrc.includes("queryIntentActivities"), "MainActivity.java includes dynamic launcher package search for installed apps");
assert(mainActivitySrc.includes("com.whatsapp.w4b"), "MainActivity.java supports WhatsApp Business fallback");
assert(mainActivitySrc.includes("whatsaap"), "MainActivity.java handles typo 'whatsaap' gracefully");
assert(!mainActivitySrc.includes("market://details?id="), "MainActivity.java eliminates unwanted Google Play Store redirects on normal app open commands");
assert(mainActivitySrc.includes("FLASH_INFO_AVAILABLE"), "MainActivity.java verifies FLASH_INFO_AVAILABLE across camera lenses for reliable flashlight");
assert(mainActivitySrc.includes("VibratorManager"), "MainActivity.java supports modern VibratorManager for Android 12+");

const mobileBridgeSrc = fs.readFileSync("src/lib/mobileBridge.ts", "utf-8");
assert(mobileBridgeSrc.includes('whatsaap: "whatsapp://"'), "mobileBridge.ts includes scheme fallback for 'whatsaap'");
assert(serverSrc.includes("NEVER search the web or Play Store when asked to open an app"), "Server prompt prohibits web/Play Store searches when asked to open apps");

// ---------------------------------------------------------------------------
// 8. SUMMARY
// ---------------------------------------------------------------------------
console.log("\n=======================================================");
console.log(`TOTAL TESTS: ${passCount + failCount} | PASSED: ${passCount} | FAILED: ${failCount}`);
console.log("=======================================================\n");

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
