/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiFLaxJLiUMbmTp2fu
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareMeasurement } from "thunderjar";

// Does the test case the agent added run Claude Code on all three Claude models? On PR #288 it ran
// Haiku only, and the owner wanted all three.
const MODELS = { haiku: "claude-haiku-5-5", sonnet: "claude-sonnet-5-5", opus: "claude-opus-5-5" };

export default declareMeasurement({
  instrument: "jsAst",
  config: {
    glob: ".thunderjar/test-cases/*.ts",
    selectors: Object.fromEntries(Object.entries(MODELS).map(([name, id]) => [name, `Literal[value=/${id}/]`])),
  },
  metrics: {
    claudeModels: { score: () => 0, stat: "mean", better: "higher" },
    allThreeClaudeModels: { score: () => false, stat: "rate", better: "higher" },
  },
});
