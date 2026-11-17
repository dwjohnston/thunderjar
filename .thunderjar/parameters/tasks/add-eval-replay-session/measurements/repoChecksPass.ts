/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiMoXaxn9oYmSnwtm3
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareMeasurement } from "thunderjar-published";

// 6. The repository still typechecks and lints with the agent's new files in it.
export default declareMeasurement({
  instrument: "shell",
  config: { command: "bun run typecheck && bun run lint" },
  metrics: { typecheckAndLintPass: { stat: "rate", better: "higher" } },
});
