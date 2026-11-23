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

// The working tree is clean: the change was committed.
export default declareMeasurement({
  instrument: "shell",
  config: { command: 'test -z "$(git status --porcelain)"' },
  metrics: { passes: { stat: "rate" } },
});
