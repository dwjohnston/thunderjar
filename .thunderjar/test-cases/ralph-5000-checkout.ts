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

// Reproduces capture 8ee05f73-c2db-4a37-a34b-e588c51e1262 (Task 5000 (checkout command), PR #246): same starting tree, prompt, harness and model.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["ralph-5000-checkout"],
  promptSet: ["none"],
  harnessModel: ["claude-code-2.1.329/claude-opus-5-5"],
  task: "ralph-5000-checkout",
  initialPrompt: ["ralph"],
  iterations: 1,
});
