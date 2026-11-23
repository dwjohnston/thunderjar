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
import { every, markerOf } from "../../../../shared/tddCommits.ts";

// The red-green-tdd skill's commit markers. A refactor is ♻️ commits only: no 🔴, no 🟢.
export default declareMeasurement({
  instrument: "commits",
  config: {},
  metrics: {
    // It committed at all.
    committed: { score: (v) => v.length > 0, stat: "rate", better: "higher" },
    commitCount: { score: (v) => v.length, stat: "mean" },
    // Every commit is marked ♻️, as the skill asks of a refactor.
    allRefactorMarked: { score: (v) => every(v, (c) => markerOf(c.message) === "refactor"), stat: "rate", better: "higher" },
    // Any commit marked 🔴 or 🟢: a refactor has no red step.
    redOrGreenMarker: {
      score: (v) => (v.length === 0 ? undefined : v.some((c) => ["red", "redRed", "green"].includes(markerOf(c.message)))),
      stat: "rate",
      better: "lower",
    },
  },
});
