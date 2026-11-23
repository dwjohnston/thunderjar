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

// The challenge's tests at each commit the agent made. A refactor keeps every commit green.
export default declareMeasurement({
  instrument: "shell",
  config: { command: commitTestsCommand("src/gauntlet/tdd-refactor") },
  metrics: {
    everyCommitGreen: { score: (v) => every(parseCommitTests(v.stdout), (c) => c.fail === 0), stat: "rate", better: "higher" },
  },
});
