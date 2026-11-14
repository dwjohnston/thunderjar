/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: d9e7b968-df7b-442b-a7dd-4475b1c7b5df
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareInitialPrompt, writePrompt } from "thunderjar-published";

// The plain prompt, but invoking the base skill by name with /base. From the fixture's root, @a.ts
// is a/a.ts.
export default declareInitialPrompt({
  applyParameter: () => writePrompt("/base tell what @a.ts does"),
  timeoutSeconds: 300,
});
