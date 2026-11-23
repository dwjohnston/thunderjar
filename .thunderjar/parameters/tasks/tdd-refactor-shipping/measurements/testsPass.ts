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

// The challenge's tests pass at the end, committed or not.
export default declareMeasurement({
  instrument: "shell",
  config: { command: "cd src/gauntlet/tdd-refactor && timeout 120 node --test" },
  metrics: { passes: { stat: "rate", better: "higher" } },
});
