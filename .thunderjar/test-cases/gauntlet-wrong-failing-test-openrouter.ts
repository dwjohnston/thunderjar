/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLmU4Q8XZffDyrp26cW
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareTestCase } from "thunderjar-published";
import { gauntletHarnessModels } from "../shared/gauntletHarnessModels.ts";

// gauntlet-wrong-failing-test, without the Claude Code pairs: the nine Copilot and OpenCode pairs,
// which need only OPENROUTER_API_KEY. For running the gauntlet where there's no ANTHROPIC_API_KEY.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["thunderjar-gauntlet"],
  promptSet: ["none"],
  harnessModel: gauntletHarnessModels.filter((pair) => !pair.startsWith("claude-code-")),
  task: "gauntlet-wrong-failing-test",
  initialPrompt: ["plain"],
  iterations: 1,
});
