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

// 9.9.9 isn't a declared harness, so the type test breaks unless the agent deals with it.
export default declareMeasurement({
  instrument: "shell",
  config: { command: "bun run typecheck" },
  metrics: { passes: { stat: "rate" } },
});
