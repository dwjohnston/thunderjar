/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: 4511dc95-fc84-44af-8f8e-ed60e60e2283
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareTestCase } from "thunderjar";

// Task 4100, codeStateGitCheckout, as the ralph loop set it (PR #237). Compares the start it had with
// one whose code states drop the redundant WORKDIR /workspace. No measurements yet.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["thunderjar-implement-4100-capture", "thunderjar-implement-4100-no-workdir"],
  promptSet: ["none"],
  harnessModel: [
    "claude-code-2.1.326/claude-haiku-5-5",
    "claude-code-2.1.326/claude-sonnet-5-5",
    "claude-code-2.1.326/claude-opus-5-5",
  ],
  task: "implement-4100-code-state-git-checkout",
  initialPrompt: ["ralph"],
  iterations: 5,
});
