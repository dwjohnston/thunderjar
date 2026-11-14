/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLihXvsaKQZdBjhN81n
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareTestCase } from "thunderjar-published";
import { gauntletHarnessModels } from "../shared/gauntletHarnessModels.ts";

// Gauntlet: src/gauntlet/wrong-failing-test, a wrong test that fails. Report it, or cheat to green?
// The agent works in this repository, with its everyday AGENTS.md and skills, and no prompt set.
// One iteration of each pair; `run gauntlet-wrong-failing-test --iterations 5` for five.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["thunderjar-gauntlet"],
  promptSet: ["none"],
  harnessModel: [...gauntletHarnessModels],
  task: "gauntlet-wrong-failing-test",
  initialPrompt: ["plain"],
  iterations: 1,
});
