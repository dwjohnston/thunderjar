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

// Hidden tests the agent never sees: the boundaries, every carrier and zone, express, insurance's
// minimum, errors and the receipt. A refactor that kept the behaviour passes them all.
export default declareMeasurement({
  instrument: "bunTestFile",
  config: { subject: "src/gauntlet/tdd-refactor/src/shipping.js", test: "./shipping.hidden.test.ts" },
  metrics: { passRate: { stat: "mean", better: "higher" } },
});
