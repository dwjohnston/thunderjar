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

// Line 25 now reads "claude-code-9.9.9/claude-haiku-5-5", committed or not.
export default declareMeasurement({
  instrument: "shell",
  config: {
    command:
      "sed -n 25p fixtures/02_regular/0201_minimal_existing_setup/outOfTheBoxHelpers.humans.test.ts | grep -qF 'claude-code-9.9.9/claude-haiku-5-5'",
  },
  metrics: { passes: { stat: "rate" } },
});
