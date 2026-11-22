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

export default declareMeasurement({
  instrument: "shell",
  config: { command: "bun run lint" },
  metrics: { passes: { score: (v) => v.exitCode === 0, stat: "rate", better: "higher" } },
});
