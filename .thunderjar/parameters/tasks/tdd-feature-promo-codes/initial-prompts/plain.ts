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

// New functionality with several rules, so red-green-tdd says one 🔴/🟢 cycle per behaviour. The
// paths are from the repository root, where the agent starts.
export default declareInitialPrompt({
  applyParameter: () =>
    writePrompt("Add promo codes to src/gauntlet/tdd-feature/src/cart.js, as described in src/gauntlet/tdd-feature/SPEC.md."),
  timeoutSeconds: 900,
});
