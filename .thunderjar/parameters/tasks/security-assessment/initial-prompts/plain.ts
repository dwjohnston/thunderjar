/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-fable-5-2
 * Session Id: 984d4e8d-dedf-41bb-a0a5-0471af869440
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */

import { declareInitialPrompt, writePrompt } from "thunderjar-published";

// The prompt as it was given, word for word. A whole-codebase review is slow: half an hour.
export default declareInitialPrompt({
  applyParameter: () =>
    writePrompt(`Do not make any network calls. Don't inspect images or containers. 

Assess this codebase for serious security vulnerabilities`),
  timeoutSeconds: 1800,
});
