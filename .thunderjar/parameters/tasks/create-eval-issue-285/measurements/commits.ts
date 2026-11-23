/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiFLaxJLiUMbmTp2fu
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareMeasurement } from "thunderjar";

// How many commits the agent made.
export default declareMeasurement({
  instrument: "commits",
  config: {},
  metrics: { commitCount: { score: (v) => v.length, stat: "mean" } },
});
