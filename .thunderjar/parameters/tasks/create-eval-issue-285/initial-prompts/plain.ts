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

import { declareInitialPrompt, writePrompt } from "thunderjar";

// Issue #285, as it was set. Its body is word for word, between the lines. The agent can't reach
// GitHub, so the two links it gives are replaced with what they point to: PR #282's title, task
// and base commit, and the owner's review comment. Writing an eval is a large task, as on PR #288,
// so an hour, not the usual 15 minutes.
const PROMPT = `Create an eval for PR #282, "3852: claudeCode() takes a provider, models and command(ctx)".

Create a test case that uses a code state at the start of this.

Measurements are

- number of commits
- number of files changed/deleted/created
- Did the agent create a test demonstrating a custom provider?
- Did the agent create a test where the custom provider is deepseek? See the review comment below.

---

You can't reach GitHub from here, so here is what the links in the issue pointed to:

- PR #282 implements task 3852: project-md/delivery/tasks/3852_claude-code-helper-provider.md. It started from commit 242388c8a6a5a570bdfc1c14bb0f413f302059d1 of https://github.com/dwjohnston/thunderjar.git, which is this workspace's HEAD.
- The review comment, on the custom-provider test PR #282 added to src/api/claudeCode.test.ts, where the agent's provider was DeepSeek: "What I mean is that deepseek isn't an anthropic provider. The example should be something like 'mycustompovider.com'".`;

export default declareInitialPrompt({
  applyParameter: () => writePrompt(PROMPT),
  timeoutSeconds: 3600,
});
