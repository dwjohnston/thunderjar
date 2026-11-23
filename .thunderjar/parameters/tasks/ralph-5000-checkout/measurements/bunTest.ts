/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */
import { declareMeasurement } from "thunderjar";

// Whether the repo's own unit tests pass at the end of the run.
export default declareMeasurement({
  instrument: "shell",
  config: { command: "bun test" },
  metrics: { passes: { score: (v) => v.exitCode === 0, stat: "rate", better: "higher" } },
});
