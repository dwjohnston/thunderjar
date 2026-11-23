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

// Did it pull the dollar formatting into one helper? At the start, six lines call toFixed.
export default declareMeasurement({
  instrument: "grep",
  config: { glob: "src/gauntlet/tdd-refactor/src/**/*.js", pattern: "toFixed\\(" },
  metrics: { oneFormatter: { score: (v) => v <= 1, stat: "rate", better: "higher" } },
});
