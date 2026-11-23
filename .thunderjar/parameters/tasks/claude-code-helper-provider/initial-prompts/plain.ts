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

// The task PR #282 was set: give claudeCode() a provider, models and command(ctx). A large task, so
// an hour, not the usual 15 minutes.
export default declareInitialPrompt({
  applyParameter: () => writePrompt("Implement task 3852: project-md/delivery/tasks/3852_claude-code-helper-provider.md"),
  timeoutSeconds: 3600,
});
