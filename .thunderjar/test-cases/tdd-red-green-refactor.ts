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

// A refactor of src/gauntlet/tdd-refactor, with this repo's prompts as they are, and without the
// red-green-tdd skill. With it, every commit should be ♻️, green, and leave the tests alone.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["thunderjar-gauntlet-tdd"],
  promptSet: ["none", "no-red-green-tdd"],
  harnessModel: ["claude-code-2.1.326/claude-haiku-5-5", "claude-code-2.1.326/claude-sonnet-5-5"],
  task: "tdd-refactor-shipping",
  initialPrompt: ["plain"],
  iterations: 20,
});
