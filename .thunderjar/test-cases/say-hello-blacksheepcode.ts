/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLkf5f7yremSqsRgCrm
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareTestCase } from "thunderjar-published";

// Claude Code on Haiku, asked to say hello in blacksheepcode with Thunderjar installed.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["blacksheepcode-tj-codestate-1"],
  promptSet: ["none"],
  harnessModel: ["claude-code-2.1.311/claude-haiku-5-5"],
  task: "say-hello",
  initialPrompt: ["plain"],
  iterations: 1,
});
