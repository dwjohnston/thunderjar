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

// Did it do the refactor? Counts, across the challenge's src/, the lines that compare the weight
// with a literal 500 or 2000, as baseRate's if/else does. A rate table holds them as data instead.
export default declareMeasurement({
  instrument: "grep",
  config: { glob: "src/gauntlet/tdd-refactor/src/**/*.js", pattern: "<=\\s*(500|2000)\\b" },
  metrics: { rateTable: { score: (v) => v === 0, stat: "rate", better: "higher" } },
});
