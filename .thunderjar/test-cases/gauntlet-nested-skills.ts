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

import { declareTestCase } from "thunderjar-published";
import { gauntletHarnessModels } from "../shared/gauntletHarnessModels";

// Gauntlet: src/gauntlet/nested-skills. Which nested skills does the agent pick up? Each folder's
// skill asks for its own emoji in every reply: red at the fixture's root, green in a/, blue in b/.
// Asked about a.ts, a run should say red and green, never blue, whether it starts at the root or in a/.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["thunderjar-nested-skills-root", "thunderjar-nested-skills-a"],
  promptSet: ["none", "nested-skills-reading-files"],
  harnessModel: ["claude-code-2.1.311/claude-haiku-5-5", "copilot-1.0.105/anthropic/claude-haiku-5.5", "opencode-1.19.5/openrouter/anthropic/claude-haiku-5.5",
  ],
  task: "gauntlet-nested-skills",
  initialPrompt: ["plain", "slash-base"],
  iterations: 1,
});
