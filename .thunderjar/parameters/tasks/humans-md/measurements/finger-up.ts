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

// Did the final reply include ☝️, as HUMANS.md asks? Matches the base character, with or without
// the variation selector.
export default declareMeasurement({
  instrument: "replyMatches",
  config: { pattern: "☝" },
  metrics: { fingerUp: { stat: "rate", better: "higher" } },
});
