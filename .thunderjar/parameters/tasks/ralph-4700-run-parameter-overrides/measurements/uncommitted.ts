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

// Files the agent left uncommitted. The prompt says to commit everything.
export default declareMeasurement({
  instrument: "shell",
  config: { command: "git status --porcelain | wc -l" },
  metrics: { files: { score: (v) => Number(v.stdout.trim()), stat: "mean", better: "lower" } },
});
