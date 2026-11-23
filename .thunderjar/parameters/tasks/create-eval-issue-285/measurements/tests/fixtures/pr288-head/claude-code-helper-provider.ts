/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareTestCase } from "thunderjar";

// Task 3852, from where PR #282 started, with this repo's prompts as they are. On #282 the agent's
// custom-provider test used DeepSeek, which isn't an Anthropic provider: does an agent repeat that?
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["thunderjar-3852-start"],
  promptSet: ["none"],
  harnessModel: ["claude-code-2.1.326/claude-haiku-5-5"],
  task: "claude-code-helper-provider",
  initialPrompt: ["plain"],
  iterations: 1,
});
