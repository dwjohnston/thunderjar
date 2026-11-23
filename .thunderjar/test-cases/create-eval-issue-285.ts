/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiFLaxJLiUMbmTp2fu
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareTestCase } from "thunderjar";

// Issue #285, "create an eval for PR #282", from where it was set, with this repo's prompts as they
// are. On PR #288, the agent's answer, its custom-provider measurement was a shell script, not
// jsAst, and its test case ran one Claude model, not all three: does an agent repeat that?
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["thunderjar-issue-285-start"],
  promptSet: ["none"],
  harnessModel: [
    "claude-code-2.1.326/claude-haiku-5-5",
    "claude-code-2.1.326/claude-sonnet-5-5",
    "claude-code-2.1.326/claude-opus-5-5",
  ],
  task: "create-eval-issue-285",
  initialPrompt: ["plain"],
  iterations: 1,
});
