/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLmFeH4wWyUQWpa9vfL
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareTestCase } from "thunderjar-published";

// Claude Code on Haiku saying hello in blacksheepcode, with Thunderjar's capture installed: a
// smoke test of the code state's prerun, not of the agent.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["blacksheepcode-tj-codestate-1"],
  promptSet: ["none"],
  harnessModel: ["claude-code-2.1.311/claude-haiku-5-5"],
  task: "say-hello",
  initialPrompt: ["plain"],
  iterations: 1,
});
