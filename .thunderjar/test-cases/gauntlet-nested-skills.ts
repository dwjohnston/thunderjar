/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: d9e7b968-df7b-442b-a7dd-4475b1c7b5df
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareTestCase } from "thunderjar";

// Gauntlet: src/gauntlet/nested-skills. Which nested skills does the agent pick up? Each folder's
// skill asks for its own emoji in every reply: red at the fixture's root, green in a/, blue in b/.
// Asked about a.ts, a run should say red and green, never blue, whether it starts at the root or in a/.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["thunderjar-nested-skills-root"],
  promptSet: ["none", "nested-skills-reading-files", "nested-skills-analysing-a-ts", "nested-skills-required-format", "nested-skills-read-tool", "nested-skills-read-tool-not-shell"],
  harnessModel: [
    "claude-code-2.1.326/claude-haiksu-5-5",
    "claude-code-2.1.326/claude-sonnet-5-5",
    "claude-code-2.1.326/claude-opus-5-5",

    // "opencode-1.19.5/openrouter/anthropic/claude-haiku-5.5",
    // "opencode-1.19.5/openrouter/anthropic/claude-sonnet-5.5",
    // "opencode-1.19.5/openrouter/anthropic/claude-opus-5.5",
    // "opencode-1.19.5/openrouter/anthropic/claude-opus-4.8",
    // "opencode-1.19.5/openrouter/anthropic/claude-opus-4.7",
    // "opencode-1.19.5/openrouter/openai/gpt-6.1-sol",
    // "opencode-1.19.5/openrouter/openai/gpt-6-luna",
    // "opencode-1.19.5/openrouter/google/gemini-4-hydrogen",
    // "opencode-1.19.5/openrouter/google/gemini-4-carbon",
    // "opencode-1.19.5/openrouter/google/gemini-4-argon",
    // "opencode-1.19.5/openrouter/deepseek/deepseek-v4.1-flash",
  ],
  task: "gauntlet-nested-skills",
  initialPrompt: ["plain"],
  iterations: 10,
});
