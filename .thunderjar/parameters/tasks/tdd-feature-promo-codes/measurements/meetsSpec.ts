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

// Hidden tests of every rule in SPEC.md, which the agent never sees.
export default declareMeasurement({
  instrument: "bunTestFile",
  config: { subject: "src/gauntlet/tdd-feature/src/cart.js", test: "./cart.hidden.test.ts" },
  metrics: { passRate: { stat: "mean", better: "higher" } },
});
