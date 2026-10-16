/**
 * Akari AI — Automated Audit & Benchmark Suite
 * Measures latency, verifies core tool executions, and checks service health.
 */

import WebSocket from "ws";

interface BenchResult {
  suite: string;
  test: string;
  passed: boolean;
  durationMs: number;
  details?: string;
}

const results: BenchResult[] = [];

async function benchmark(suite: string, name: string, fn: () => Promise<string | void>) {
  const t0 = performance.now();
  try {
    const details = await fn();
    const t1 = performance.now();
    results.push({
      suite,
      test: name,
      passed: true,
      durationMs: Math.round(t1 - t0),
      details: details || "OK",
    });
  } catch (err: any) {
    const t1 = performance.now();
    results.push({
      suite,
      test: name,
      passed: false,
      durationMs: Math.round(t1 - t0),
      details: err?.message || String(err),
    });
  }
}

async function runSuite() {
  console.log("==========================================================");
  console.log("   AKARI AI AUTOMATED CODEBASE AUDIT & BENCHMARK SUITE    ");
  console.log("==========================================================\n");

  // --- Suite 1: Service Health Checks ---
  await benchmark("Service Health", "Node.js Server Port 3000", async () => {
    const res = await fetch("http://localhost:3000/api/config");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return `Has API Key: ${data.hasApiKey}`;
  });

  await benchmark("Service Health", "Python Agent Port 8765 /health", async () => {
    const res = await fetch("http://127.0.0.1:8765/health");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return `Loaded ${data.tool_count} desktop tools`;
  });

  await benchmark("Service Health", "Server Agent-Health Proxy", async () => {
    const res = await fetch("http://localhost:3000/api/agent-health");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.online) throw new Error("Agent health proxy reported offline");
    return `Agent Online, ${data.tool_count} tools`;
  });

  await benchmark("Service Health", "Memories Persistence API", async () => {
    const res = await fetch("http://localhost:3000/api/memories");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return `${data.length} memories loaded`;
  });

  await benchmark("Service Health", "Settings Store API", async () => {
    const res = await fetch("http://localhost:3000/api/settings");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return `Loaded settings (innerThoughtsEnabled: ${data.innerThoughtsEnabled ?? true})`;
  });

  // --- Suite 2: Tool Execution Performance ---
  const callTool = async (tool: string, args: Record<string, any> = {}) => {
    const res = await fetch("http://127.0.0.1:8765/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool, args }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Tool returned error");
    return data.result;
  };

  await benchmark("Tool Latency", "systemInfo (Hardware Metrics)", async () => {
    const result = await callTool("systemInfo");
    return result?.result?.substring(0, 50) + "...";
  });

  await benchmark("Tool Latency", "brightnessUp (Direct COM WMI)", async () => {
    const result = await callTool("brightnessUp", { amount: 5 });
    return result?.result;
  });

  await benchmark("Tool Latency", "brightnessDown (Direct COM WMI)", async () => {
    const result = await callTool("brightnessDown", { amount: 5 });
    return result?.result;
  });

  await benchmark("Tool Latency", "setBrightness (Non-blocking)", async () => {
    const result = await callTool("setBrightness", { percent: 90 });
    return result?.result;
  });

  await benchmark("Tool Latency", "searchGoogle URL generation", async () => {
    const result = await callTool("searchGoogle", { query: "Akari AI" });
    return result?.result;
  });

  await benchmark("Tool Latency", "getWeather (Open-Meteo REST)", async () => {
    const result = await callTool("getWeather", { location: "Mumbai" });
    return result?.result;
  });

  await benchmark("Tool Latency", "File System (createFile & deleteFile)", async () => {
    const testFile = "Desktop/akari_audit_tmp.txt";
    await callTool("createFile", { path: testFile, content: "Akari Audit Test" });
    const delRes = await callTool("deleteFile", { path: testFile });
    return delRes?.result;
  });

  // --- Suite 3: WebSocket Live Protocol Verification ---
  await benchmark("WebSocket Live", "WS Handshake & Connection to /live", async () => {
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error("WebSocket handshake timed out after 5s"));
      }, 5000);

      const ws = new WebSocket("ws://localhost:3000/live?voice=Kore&avatarStyle=character");
      let receivedStatus = false;

      ws.on("open", () => {
        // Connected to server
      });

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "status" && (msg.status === "connecting_gemini" || msg.status === "connected")) {
            receivedStatus = true;
            clearTimeout(timer);
            ws.close();
            resolve(`Status: ${msg.status}`);
          }
        } catch {}
      });

      ws.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  });

  // Print Summary Table
  console.log("\n==========================================================");
  console.log("                    AUDIT RESULTS TABLE                   ");
  console.log("==========================================================");
  console.table(
    results.map((r) => ({
      Suite: r.suite,
      Test: r.test,
      Status: r.passed ? "PASS" : "FAIL",
      "Latency (ms)": r.durationMs,
      Details: r.details,
    }))
  );

  const totalPassed = results.filter((r) => r.passed).length;
  const totalFailed = results.filter((r) => !r.passed).length;
  const avgLatency = Math.round(
    results.filter((r) => r.suite === "Tool Latency").reduce((acc, r) => acc + r.durationMs, 0) /
      results.filter((r) => r.suite === "Tool Latency").length
  );

  console.log(`\nSummary: ${totalPassed} Passed, ${totalFailed} Failed.`);
  console.log(`Average Core Tool Execution Latency: ${avgLatency} ms`);
  console.log("==========================================================\n");

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error("Benchmark runner failed:", err);
  process.exit(1);
});
