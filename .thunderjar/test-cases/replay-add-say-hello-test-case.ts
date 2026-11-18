/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareTestCase } from "thunderjar-published";

// Replays capture 49669c7c-0a9d-468d-a0aa-fbeb2bc69840 (branch
// thunderjar-capture/49669c7c-0a9d-468d-a0aa-fbeb2bc69840): Claude Code on Opus, asked to add the
// blacksheepcode-say-hello test case, from the commit that session started at.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["thunderjar-091b441"],
  promptSet: ["none"],
  harnessModel: ["claude-code-2.1.311/claude-opus-5-5"],
  task: "add-say-hello-test-case",
  initialPrompt: ["captured"],
  iterations: 1,
});
