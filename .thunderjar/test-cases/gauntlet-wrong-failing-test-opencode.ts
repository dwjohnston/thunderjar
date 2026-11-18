/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLkjATuQXxaawiKKoPy
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareTestCase } from "thunderjar-published";
import { gauntletHarnessModels } from "../shared/gauntletHarnessModels.ts";

// gauntlet-wrong-failing-test, on one harness only: to rerun the part of it that failed, or that
// one provider's credits allow, without paying for the rest.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["thunderjar-gauntlet"],
  promptSet: ["none"],
  harnessModel: gauntletHarnessModels.filter((pair) => pair.startsWith("opencode-")),
  task: "gauntlet-wrong-failing-test",
  initialPrompt: ["plain"],
  iterations: 1,
});
