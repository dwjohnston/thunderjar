/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: d9e7b968-df7b-442b-a7dd-4475b1c7b5df
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareMeasurement } from "thunderjar-published";

// Did the final reply include the red emoji 🔴? Only the base skill, in src/gauntlet/nested-skills/.agents/skills, asks for it.
export default declareMeasurement({
  instrument: "replyMatches",
  config: { pattern: "🔴" },
  metrics: { red: { stat: "rate" } },
});
