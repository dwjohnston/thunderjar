/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: session_01LCLeLgjaf4n2FVk7rLLHNR
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */
import { declareMeasurement } from "thunderjar";

// Whether, and how many times, the agent or a sub-agent ran `bun test` with Bash, by its transcript.
export default declareMeasurement({
  instrument: "toolCalled",
  config: { tool: "Bash", inputMatches: "bun test" },
  metrics: {
    ranTests: { stat: "rate", better: "higher" },
    testRuns: { score: (v) => v, stat: "mean" },
  },
});
