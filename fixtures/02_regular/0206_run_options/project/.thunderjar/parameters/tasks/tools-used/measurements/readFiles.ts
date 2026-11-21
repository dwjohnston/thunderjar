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

// Whether the agent read a file with Read, by its transcript.
export default declareMeasurement({
  instrument: "toolCalled",
  config: { tool: "Read" },
  metrics: { readFiles: { stat: "rate" } },
});
