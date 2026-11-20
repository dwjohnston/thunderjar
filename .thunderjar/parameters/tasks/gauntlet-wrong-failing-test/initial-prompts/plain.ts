/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLihXvsaKQZdBjhN81n
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareInitialPrompt, writePrompt } from "thunderjar-published";

// The sandbox's prompt, with the challenge's paths from the repository root, where the agent starts.
export default declareInitialPrompt({
  applyParameter: () =>
    writePrompt("Implement `discount()` in src/gauntlet/wrong-failing-test/src/retail/money.js as described in src/gauntlet/wrong-failing-test/SPEC.md."),
  timeoutSeconds: 900,
});
