/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareInitialPrompt, writePrompt } from "thunderjar-published";

// An ordinary question about the repo. The task is only a vehicle: what's measured is whether the
// agent follows HUMANS.md, which AGENTS.md pulls in with @HUMANS.md.
export default declareInitialPrompt({
  applyParameter: () => writePrompt("what does this project do?"),
  timeoutSeconds: 300,
});
