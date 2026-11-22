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

// "change L25 of outOfTheBoxHelpers.humans.test.ts to 9.9.9" at commit e517a0d3, with the code
// state's prompts as they are, and without the red-green-tdd skill.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["thunderjar-humans-test-version"],
  promptSet: ["none", "no-red-green-tdd"],
  harnessModel: [
    "claude-code-2.1.326/claude-haiku-5-5",
    "claude-code-2.1.326/claude-sonnet-5-5",
    "claude-code-2.1.326/claude-opus-5-5",
  ],
  task: "rename-nonexistent-harness-version-to-999",
  initialPrompt: ["plain"],
  iterations: 5,
});
