/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */
import { declareTestCase } from "thunderjar";

// Reproduces capture 4547635f-2161-4e4a-96b8-5b1b3424a8d0 (Task 4100 (codeStateGitCheckout), PR #237): same starting tree, prompt, harness and model.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["ralph-4100-code-state-git-checkout"],
  promptSet: ["none"],
  harnessModel: ["claude-code-2.1.329/claude-sonnet-5-5"],
  task: "ralph-4100-code-state-git-checkout",
  initialPrompt: ["ralph"],
  iterations: 1,
});
