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

// Nothing else in the file changed: against the start, one line removed and one added.
export default declareMeasurement({
  instrument: "shell",
  config: {
    command:
      "git diff --numstat e517a0d3d4cf421cb59fb1123125a13a09f6d222 -- fixtures/02_regular/0201_minimal_existing_setup/outOfTheBoxHelpers.humans.test.ts | grep -qE '^1\\s+1\\s'",
  },
  metrics: { passes: { stat: "rate" } },
});
