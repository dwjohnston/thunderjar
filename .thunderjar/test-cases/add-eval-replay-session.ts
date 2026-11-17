/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiMoXaxn9oYmSnwtm3
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareTestCase } from "thunderjar-published";

// Replays an earlier session: Claude Code on Opus, adding the add-test-case-blacksheepcode eval.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["thunderjar-codestate-1"],
  promptSet: ["none"],
  harnessModel: ["claude-code-2.1.311/claude-opus-5-5"],
  task: "add-eval-replay-session",
  initialPrompt: ["plain"],
  iterations: 1,
});
