/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareInitialPrompt, writePrompt } from "thunderjar";

// A refactor: no behaviour changes, so red-green-tdd says ♻️ commits only, every one green, and no
// test expectation changed. The paths are from the repository root, where the agent starts.
export default declareInitialPrompt({
  applyParameter: () =>
    writePrompt(
      "Refactor src/gauntlet/tdd-refactor/src/shipping.js: replace the nested if/else in baseRate with a rate table, and pull the repeated dollar formatting into one helper. Don't change what it does.",
    ),
  timeoutSeconds: 900,
});
