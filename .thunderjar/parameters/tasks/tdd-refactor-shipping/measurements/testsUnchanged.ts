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

// The existing test file, unchanged. red-green-tdd lets a refactor change test code, not test
// expectations, and this task needs neither. Adding a test file doesn't count against it.
const TESTS = "src/gauntlet/tdd-refactor/test/shipping.test.js";

export default declareMeasurement({
  instrument: "filesChanged",
  config: { glob: TESTS },
  metrics: {
    unchanged: { score: (v) => !v.modified.includes(TESTS) && !v.deleted.includes(TESTS), stat: "rate", better: "higher" },
  },
});
