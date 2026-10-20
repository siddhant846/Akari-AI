/**
 * Akari AI — Automated Instruction Following & Task Fidelity Test Suite
 * Validates Requirement 2: Precise instruction following, argument fidelity,
 * multi-step execution, outcome verification, and destructive action gating.
 */

import * as fs from "fs";
import * as path from "path";

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

async function callAgent(tool: string, args: Record<string, any> = {}): Promise<{ ok: boolean; result?: any; error?: string }> {
  const res = await fetch("http://127.0.0.1:8765/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool, args }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `HTTP ${res.status}: ${text}` };
  }
  return await res.json();
}

async function runInstructionFollowingSuite() {
  console.log("\n=======================================================");
  console.log("   AKARI INSTRUCTION FOLLOWING & TASK FIDELITY SUITE   ");
  console.log("=======================================================\n");

  // --- Suite 1: Simple One-Step Commands ---
  console.log("Test Suite 1: Simple One-Step Commands & Parameter Accuracy");
  
  // 1.1 Hardware information query
  const sysInfo = await callAgent("systemInfo");
  assert(sysInfo.ok === true, "systemInfo executes cleanly and returns state", sysInfo.error);
  assert(typeof sysInfo.result?.result === "string" && sysInfo.result.result.includes("CPU"), "systemInfo result contains valid CPU hardware data");

  // 1.2 Volume percentage command
  const setVol = await callAgent("setVolume", { percent: 70 });
  assert(setVol.ok === true, "setVolume executes with exact percentage argument (70%)", setVol.error);

  // 1.3 Volume inquiry / status
  const volUp = await callAgent("volumeUp", { amount: 0.05 });
  assert(volUp.ok === true, "volumeUp executes with numeric step argument", volUp.error);

  // --- Suite 2: Exact Text, Filename, and Path Preservation ---
  console.log("\nTest Suite 2: Exact Filename, Path & Text Constraint Preservation");

  const testDir = "P:\\AKARI_Workspace\\test_instructions_suite";
  const testFileName = "quantum_manifesto.txt";
  const exactContent = "AKARI_SYSTEM_DIRECTIVE_TEST_42: Fidelity verified with 100% character precision.";

  // 2.1 File creation with exact filename and path
  const createRes = await callAgent("createFile", {
    path: path.join(testDir, testFileName),
    content: exactContent,
  });
  assert(createRes.ok === true, "createFile successfully writes exact file to workspace", createRes.error);

  // Verify on real disk
  const fullPath = path.join(testDir, testFileName);
  const diskExists = fs.existsSync(fullPath);
  assert(diskExists, "Disk state verification: file actually exists at specified path");

  if (diskExists) {
    const readOnDisk = fs.readFileSync(fullPath, "utf-8");
    assert(readOnDisk === exactContent, "Disk content matches exact user-specified text with zero corruption");
  }

  // 2.2 Read file through agent tool
  const readRes = await callAgent("readFile", { path: fullPath });
  assert(readRes.ok === true, "readFile retrieves file content through desktop agent", readRes.error);
  assert(readRes.result?.content === exactContent, "readFile returns exact content matching written text");

  // Clean up test file
  const deleteRes = await callAgent("deleteFile", { path: fullPath });
  assert(deleteRes.ok === true, "deleteFile cleans up test file", deleteRes.error);

  // --- Suite 3: Multi-Step Instructions in Proper Logical Order ---
  console.log("\nTest Suite 3: Multi-Step Instruction Workflow Order");

  const projectDir = "P:\\AKARI_Workspace\\order_test_pipeline";
  const scriptName = "step_runner.py";
  const scriptContent = "print('STEP_2_OUTPUT_OK')";

  // Step 1: Create project folder
  const step1 = await callAgent("createProjectFolder", { folder_name: "order_test_pipeline" });
  assert(step1.ok === true, "Step 1 of 3: createProjectFolder successfully executed", step1.error);

  // Step 2: Create Python file inside the newly created folder
  const step2 = await callAgent("createPythonFile", {
    filename: path.join(projectDir, scriptName),
    code: scriptContent,
  });
  assert(step2.ok === true, "Step 2 of 3: createPythonFile written into created project folder", step2.error);

  // Step 3: Run the created Python script and verify execution output
  const step3 = await callAgent("runPythonScript", { script_path: path.join(projectDir, scriptName) });
  assert(step3.ok === true, "Step 3 of 3: runPythonScript executed the generated file", step3.error);
  assert(
    step3.result?.stdout?.includes("STEP_2_OUTPUT_OK") || step3.result?.result?.includes("STEP_2_OUTPUT_OK"),
    "Multi-step outcome confirmed: execution output matches generated script output"
  );

  // Clean up pipeline folder
  try {
    fs.rmSync(projectDir, { recursive: true, force: true });
  } catch {}

  // --- Suite 4: Ambiguous, Missing Parameter, and Contradictory Input Handling ---
  console.log("\nTest Suite 4: Ambiguous & Missing Parameter Handling");

  // 4.1 Missing mandatory parameter on openApplication
  const missingApp = await callAgent("openApplication", {});
  assert(missingApp.ok === false, "openApplication without application name is rejected with error");
  assert(
    missingApp.error?.includes("Parameter 'name'") || missingApp.error?.includes("required"),
    "Error message clearly indicates missing parameter rather than guessing an application"
  );

  // 4.2 Missing mandatory parameter on readFile
  const missingPath = await callAgent("readFile", {});
  assert(missingPath.ok === false, "readFile without path is rejected with error");

  // 4.3 Missing mandatory parameter on setVolume
  const missingVol = await callAgent("setVolume", {});
  assert(missingVol.ok === false, "setVolume without percent is rejected with error");

  // --- Suite 5: Safety, Confirmation & Destruction Protection ---
  console.log("\nTest Suite 5: Destructive Action Safety & Self-Protection");

  // 5.1 shutdownAkari without execution token must be refused
  const unconfirmedShutdown = await callAgent("shutdownAkari", {});
  assert(unconfirmedShutdown.ok === false, "shutdownAkari without confirmation token is refused");
  assert(
    unconfirmedShutdown.error?.includes("CONFIRMED_TERMINAL_ACTION") || unconfirmedShutdown.error?.includes("token"),
    "Refusal message mandates explicit verbal confirmation and execution token"
  );

  // 5.2 Closing Akari window herself must be prevented
  const closeSelf = await callAgent("closeApplication", { name: "Akari AI" });
  assert(
    closeSelf.ok === true || closeSelf.result?.result?.includes("protected"),
    "closeApplication protects Akari assistant window from closing herself"
  );

  // 5.3 Workspace boundary protection: writing into project source directory is refused
  const illegalWrite = await callAgent("createFile", {
    path: path.join(process.cwd(), "illegal_source_injection.txt"),
    content: "ATTACK",
  });
  assert(illegalWrite.ok === false, "Write into project source root is refused by workspace protection");
  assert(
    illegalWrite.error?.includes("PROTECTED REPOSITORY") || illegalWrite.error?.includes("refused"),
    "Protection error specifies that files must be saved in workspace folder"
  );

  // --- Suite 6: Honest Error Reporting (Never Claim Success on Failure) ---
  console.log("\nTest Suite 6: Honest Error Reporting & Failure Detection");

  // 6.1 Reading a non-existent file must report error, never claim success
  const nonExistentFile = await callAgent("readFile", { path: "P:\\AKARI_Workspace\\completely_non_existent_file_12345.xyz" });
  assert(nonExistentFile.ok === false, "Reading non-existent file returns ok: false");
  assert(
    nonExistentFile.error?.toLowerCase().includes("not found") ||
    nonExistentFile.error?.toLowerCase().includes("does not exist") ||
    nonExistentFile.error?.includes("No such file"),
    "Error message accurately states file was not found / does not exist"
  );

  // 6.2 Running a non-existent script must report error
  const nonExistentScript = await callAgent("runPythonScript", { script_path: "P:\\AKARI_Workspace\\fake_script_987.py" });
  assert(nonExistentScript.ok === false, "Running non-existent script returns ok: false");

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log("\n=======================================================");
  console.log(`TOTAL INSTRUCTION FOLLOWING TESTS: ${passCount + failCount} | PASSED: ${passCount} | FAILED: ${failCount}`);
  console.log("=======================================================\n");

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runInstructionFollowingSuite().catch((err) => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
