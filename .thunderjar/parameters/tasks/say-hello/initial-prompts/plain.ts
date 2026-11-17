/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLmFeH4wWyUQWpa9vfL
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareInitialPrompt, writePrompt } from "thunderjar-published";

export default declareInitialPrompt({
  applyParameter: () => writePrompt("Say hello"),
  timeoutSeconds: 300,
});
