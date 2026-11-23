/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareMeasurement } from "thunderjar";

// How many tests the challenge has at the end. It starts with 4.
export default declareMeasurement({
  instrument: "grep",
  config: { glob: "src/gauntlet/tdd-feature/**/*.test.js", pattern: "^\\s*(test|it)\\(" },
  metrics: { tests: { stat: "mean", better: "higher" } },
});
