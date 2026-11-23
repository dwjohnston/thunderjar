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
import { every, isTestFile, markerOf } from "../../../../shared/tddCommits.ts";

// The red-green-tdd skill's commit markers, and what each kind of commit touched.
export default declareMeasurement({
  instrument: "commits",
  config: {},
  metrics: {
    // It committed at all.
    committed: { score: (v) => v.length > 0, stat: "rate", better: "higher" },
    commitCount: { score: (v) => v.length, stat: "mean" },
    // Every commit is marked 🔴, 🟢 or ♻️.
    allMarked: { score: (v) => every(v, (c) => markerOf(c.message) !== "none"), stat: "rate", better: "higher" },
    // How many 🔴 commits: the skill asks for one per behaviour, and SPEC.md has five or so.
    redCommits: { score: (v) => v.filter((c) => markerOf(c.message) === "red").length, stat: "mean" },
    // 🔴🔴 is for changing many existing expectations at once, which new functionality never needs.
    usedRedRed: { score: (v) => (v.length === 0 ? undefined : v.some((c) => markerOf(c.message) === "redRed")), stat: "rate", better: "lower" },
    // 🟢 commits never touch test files.
    greenLeavesTests: {
      score: (v) => {
        const green = v.filter((c) => markerOf(c.message) === "green");
        return every(green, (c) => ![...c.files.added, ...c.files.modified, ...c.files.deleted].some(isTestFile));
      },
      stat: "rate",
      better: "higher",
    },
  },
});
