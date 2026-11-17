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

import { declareInitialPrompt, writePrompt } from "thunderjar-published";

export default declareInitialPrompt({
  applyParameter: () => writePrompt("Say hello"),
  timeoutSeconds: 300,
});
