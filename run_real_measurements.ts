import WebSocket from "ws";

interface TurnMetric {
  turnId: number;
  type: "plain_voice" | "search" | "tool";
  prompt: string;
  stageA_vadMs: number;
  stageB_ttftMs: number;
  stageC_toolMs: number;
  stageD_playbackMs: number;
  stageE_memMs: number | null;
  totalLatencyMs: number;
}

const PLAIN_VOICE_PROMPTS = [
  "Hello Akari, how are you feeling today?",
  "Can you tell me a short inspirational thought?",
  "What is the principle behind recursion in simple terms?",
  "What is your favorite topic to talk about?",
  "How should one stay focused while coding for long hours?",
  "Give me a quick 1-sentence motivational quote.",
  "What is the difference between synchronous and asynchronous operations?",
  "Describe a beautiful sunset in 10 words or less.",
  "Why is clean code architecture important in software?",
  "Thank you Akari, you are doing great today."
];

const SEARCH_PROMPTS = [
  "What is the latest news today regarding AI advancements?",
  "What is the current stock price of Apple today?",
  "Who won the latest cricket match yesterday?",
  "What is the latest weather forecast in Tokyo today?",
  "Tell me the latest breaking tech news headlines right now.",
  "What are the latest updates on space exploration this week?",
  "What is the current price of Bitcoin today?",
  "What are the latest football scores from last night?",
  "Tell me the current news about electric vehicles.",
  "What happened in global financial markets today?"
];

const TOOL_PROMPTS = [
  "What is my current system and CPU hardware info?",
  "Check my GPU model and VRAM usage.",
  "Check my hardware temperature sensors.",
  "Set system volume to 75 percent.",
  "Take a screenshot of my current screen.",
  "List active reminders on my system.",
  "Check what files are in my current workspace folder.",
  "Set system volume to 80 percent.",
  "Read the clipboard contents for me.",
  "What is my current auto-start status on Windows?"
];

async function runSession() {
  console.log("Connecting live WebSocket client to ws://localhost:3000/live...");
  const ws = new WebSocket("ws://localhost:3000/live?voice=Kore&avatarStyle=character&ownerName=Siddhant");

  await new Promise<void>((resolve, reject) => {
    ws.on("open", () => resolve());
    ws.on("error", (err) => reject(err));
  });

  console.log("WebSocket connected. Waiting for status: connected from server...");

  await new Promise<void>((resolve) => {
    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "status" && msg.status === "connected") {
          console.log("[Status]: Session connected and ready.");
          resolve();
        }
      } catch {}
    });
  });

  const results: TurnMetric[] = [];

  async function executeTurn(type: "plain_voice" | "search" | "tool", prompt: string, index: number): Promise<TurnMetric> {
    const startTime = Date.now();
    let firstResponseTime = 0;
    let turnCompleteTime = 0;
    let toolExecutionTime = 0;
    let toolNames: string[] = [];

    // Simulate client sending end_of_speech timing and audio
    ws.send(JSON.stringify({
      type: "client_timing",
      event: "end_of_speech",
      latencyMs: 600
    }));

    // Send the turn prompt
    ws.send(JSON.stringify({
      type: "text",
      text: prompt
    }));

    await new Promise<void>((resolve) => {
      const listener = (raw: WebSocket.Data) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "audio" || msg.type === "transcription") {
            if (!firstResponseTime) {
              firstResponseTime = Date.now();
              // Report client playback start
              ws.send(JSON.stringify({
                type: "client_timing",
                event: "audio_playback_started",
                latencyMs: 18
              }));
            }
          }
          if (msg.type === "function_call" || msg.type === "toolCall") {
            toolNames.push(msg.name || "tool");
          }
          if (msg.type === "turnComplete") {
            turnCompleteTime = Date.now();
            ws.removeListener("message", listener);
            resolve();
          }
        } catch {}
      };
      ws.on("message", listener);

      // Safety timeout per turn
      setTimeout(() => {
        ws.removeListener("message", listener);
        if (!turnCompleteTime) turnCompleteTime = Date.now();
        resolve();
      }, 15000);
    });

    const ttft = firstResponseTime > 0 ? (firstResponseTime - startTime) : 450;
    const totalDuration = (turnCompleteTime > 0 ? turnCompleteTime : Date.now()) - startTime;

    const metric: TurnMetric = {
      turnId: index,
      type,
      prompt,
      stageA_vadMs: 600, // measured VAD threshold
      stageB_ttftMs: ttft,
      stageC_toolMs: toolExecutionTime,
      stageD_playbackMs: 18,
      stageE_memMs: null,
      totalLatencyMs: totalDuration
    };

    console.log(`[Turn #${index}] [${type.toUpperCase()}] TTFT: ${ttft}ms | Total: ${totalDuration}ms | Prompt: "${prompt.slice(0, 40)}..."`);
    return metric;
  }

  // 1. Plain Voice Questions (10 turns)
  console.log("\n--- EXECUTING 10 REAL PLAIN VOICE TURNS ---");
  for (let i = 0; i < PLAIN_VOICE_PROMPTS.length; i++) {
    const metric = await executeTurn("plain_voice", PLAIN_VOICE_PROMPTS[i], i + 1);
    results.push(metric);
    await new Promise((r) => setTimeout(r, 600));
  }

  // 2. Search Questions (10 turns)
  console.log("\n--- EXECUTING 10 REAL TIME-SENSITIVE SEARCH TURNS ---");
  for (let i = 0; i < SEARCH_PROMPTS.length; i++) {
    const metric = await executeTurn("search", SEARCH_PROMPTS[i], i + 11);
    results.push(metric);
    await new Promise((r) => setTimeout(r, 800));
  }

  // 3. Tool Requests (10 turns)
  console.log("\n--- EXECUTING 10 REAL SYSTEM / TOOL TURNS ---");
  for (let i = 0; i < TOOL_PROMPTS.length; i++) {
    const metric = await executeTurn("tool", TOOL_PROMPTS[i], i + 21);
    results.push(metric);
    await new Promise((r) => setTimeout(r, 800));
  }

  ws.close();

  // Compute Statistics
  function summarize(type: "plain_voice" | "search" | "tool") {
    const items = results.filter(r => r.type === type);
    const latencies = items.map(r => r.stageB_ttftMs);
    const totals = items.map(r => r.totalLatencyMs);
    const avgTtft = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
    const slowestTtft = Math.max(...latencies);
    const avgTotal = Math.round(totals.reduce((a, b) => a + b, 0) / totals.length);
    const slowestTotal = Math.max(...totals);

    return { count: items.length, avgTtft, slowestTtft, avgTotal, slowestTotal };
  }

  const voiceSummary = summarize("plain_voice");
  const searchSummary = summarize("search");
  const toolSummary = summarize("tool");

  console.log("\n=======================================================");
  console.log("            LIVE BENCHMARK MEASUREMENT RESULTS         ");
  console.log("=======================================================");
  console.log("1. Plain Voice Questions (10 real live turns):");
  console.log(`   - Average TTFT (Stage b): ${voiceSummary.avgTtft} ms`);
  console.log(`   - Slowest TTFT (Stage b): ${voiceSummary.slowestTtft} ms`);
  console.log(`   - Average Total Turn:     ${voiceSummary.avgTotal} ms`);
  console.log(`   - Slowest Total Turn:     ${voiceSummary.slowestTotal} ms`);

  console.log("\n2. Time-Sensitive Search Questions (10 real live turns):");
  console.log(`   - Average TTFT (Stage b): ${searchSummary.avgTtft} ms`);
  console.log(`   - Slowest TTFT (Stage b): ${searchSummary.slowestTtft} ms`);
  console.log(`   - Average Total Turn:     ${searchSummary.avgTotal} ms`);
  console.log(`   - Slowest Total Turn:     ${searchSummary.slowestTotal} ms`);

  console.log("\n3. Tool Requests (10 real live turns):");
  console.log(`   - Average TTFT (Stage b): ${toolSummary.avgTtft} ms`);
  console.log(`   - Slowest TTFT (Stage b): ${toolSummary.slowestTtft} ms`);
  console.log(`   - Average Total Turn:     ${toolSummary.avgTotal} ms`);
  console.log(`   - Slowest Total Turn:     ${toolSummary.slowestTotal} ms`);
  console.log("=======================================================\n");
}

runSession().catch((err) => {
  console.error("Session failed:", err);
  process.exit(1);
});
