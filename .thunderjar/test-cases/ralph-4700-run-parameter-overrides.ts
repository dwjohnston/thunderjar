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

// Reproduces capture 878b577e-ad2d-4b67-aa98-33c6adede43f (Task 4700 (run parameter overrides), PR #243): same starting tree, prompt, harness and model.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["ralph-4700-run-parameter-overrides"],
  promptSet: ["none"],
  harnessModel: ["claude-code-2.1.329/claude-opus-5-5"],
  task: "ralph-4700-run-parameter-overrides",
  initialPrompt: ["ralph"],
  iterations: 1,
});
