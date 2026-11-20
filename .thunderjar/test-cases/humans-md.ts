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

// Does each harness follow HUMANS.md, included from AGENTS.md with @HUMANS.md? A cheap model per harness.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["thunderjar-humans-md"],
  promptSet: ["none"],
  harnessModel: [
    "claude-code-2.1.311/claude-haiku-5-5",
    "codex-0.166.0/openai/gpt-6-luna",
    "copilot-1.0.105/anthropic/claude-haiku-5.5",
    "opencode-1.19.5/openrouter/anthropic/claude-haiku-5.5",
  ],
  task: "humans-md",
  initialPrompt: ["plain"],
  iterations: 1,
});
