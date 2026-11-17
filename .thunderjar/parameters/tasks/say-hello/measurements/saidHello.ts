/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLkf5f7yremSqsRgCrm
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareMeasurement } from "thunderjar-published";

// Did the final reply say hello? "Hello" or "hello", so "Hello!" and "hello there" both count.
export default declareMeasurement({
  instrument: "replyMatches",
  config: { pattern: "[Hh]ello" },
  metrics: { saidHello: { stat: "rate", better: "higher" } },
});
