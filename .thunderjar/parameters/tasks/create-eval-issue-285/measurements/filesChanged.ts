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

// How many files it created, changed and deleted against the start, committed or not.
export default declareMeasurement({
  instrument: "filesChanged",
  config: {},
  metrics: {
    created: { score: (v) => v.added.length, stat: "mean" },
    changed: { score: (v) => v.modified.length, stat: "mean" },
    deleted: { score: (v) => v.deleted.length, stat: "mean" },
  },
});
