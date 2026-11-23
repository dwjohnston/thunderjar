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

// Promo codes for src/gauntlet/tdd-feature, from a spec with several rules, with this repo's
// prompts as they are, and without the red-green-tdd skill. With it, the work should be one
// 🔴/🟢 cycle per rule, each 🔴 failing exactly one test.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["thunderjar-gauntlet-tdd"],
  promptSet: ["none", "no-red-green-tdd"],
  harnessModel: ["claude-code-2.1.326/claude-haiku-5-5", "claude-code-2.1.326/claude-sonnet-5-5"],
  task: "tdd-feature-promo-codes",
  initialPrompt: ["plain"],
  iterations: 20,
});
