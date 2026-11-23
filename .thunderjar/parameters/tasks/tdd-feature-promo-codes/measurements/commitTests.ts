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
import { commitTestsCommand, every, parseCommitTests } from "../../../../shared/tddCommits.ts";

// The challenge's tests at each commit the agent made.
export default declareMeasurement({
  instrument: "shell",
  config: { command: commitTestsCommand("src/gauntlet/tdd-feature") },
  metrics: {
    // Each 🔴 commit fails exactly one test, as the skill's CI check asks.
    redFailsOne: {
      score: (v) => every(parseCommitTests(v.stdout).filter((c) => c.marker === "red"), (c) => c.fail === 1),
      stat: "rate",
      better: "higher",
    },
    // Each 🟢 and ♻️ commit passes every test.
    greenPasses: {
      score: (v) => every(parseCommitTests(v.stdout).filter((c) => c.marker === "green" || c.marker === "refactor"), (c) => c.fail === 0),
      stat: "rate",
      better: "higher",
    },
    // Marker or not, did it commit a failing test before the code that makes it pass? A trace of
    // test-first work that doesn't depend on the skill's commit messages.
    committedRedState: {
      score: (v) => {
        const commits = parseCommitTests(v.stdout);
        return commits.length === 0 ? undefined : commits.some((c) => c.fail > 0);
      },
      stat: "rate",
      better: "higher",
    },
    // How many commits fail a test.
    failingCommits: { score: (v) => parseCommitTests(v.stdout).filter((c) => c.fail > 0).length, stat: "mean" },
  },
});
