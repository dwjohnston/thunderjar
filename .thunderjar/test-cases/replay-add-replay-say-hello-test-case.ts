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

// Replays capture e316a7d8-fd80-4c20-a535-0d43ce18c0aa (refs/thunderjar/capture/e316a7d8-…):
// Claude Code on Opus, asked to add a test case that replays capture 49669c7c, from the commit
// that session started at.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["thunderjar-55dab54"],
  promptSet: ["none"],
  harnessModel: ["claude-code-2.1.311/claude-opus-5-5"],
  task: "add-replay-say-hello-test-case",
  initialPrompt: ["captured"],
  iterations: 1,
});
