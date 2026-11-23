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

import { declareCodeState } from "thunderjar";

// This repository at 242388c8, main when issue #285 ("create an eval for PR #282") was set, and
// the commit PR #288 answered it from. It's also where PR #282 started: task 3852 is ready, and
// claudeCode() has no provider yet. Dependencies are installed, so the agent can run the
// measurement tests, the typecheck and `plan`.
//
// The commit is from before the create-eval-issue-285 task, and PR #288's own test case, were
// added to .thunderjar/, so the agent can't read its measurements or copy #288's answer. Keep it
// that way if you move it.
//
// It names the commit, not a tag: the session that wrote it couldn't push tags. To move it to the
// convention, push `tj-thunderjar-issue-285-start` at this commit and resolve it, as
// thunderjar-gauntlet does. Sealed: origin is removed.
export default declareCodeState({
  config: {
    repo: "https://github.com/dwjohnston/thunderjar.git",
    commit: "242388c8a6a5a570bdfc1c14bb0f413f302059d1",
  },
  applyParameter: (config) => `RUN git clone --quiet ${config.repo} /workspace \\
  && git -C /workspace fetch --quiet origin ${config.commit} \\
  && git -C /workspace checkout --quiet --detach ${config.commit} \\
  && git -C /workspace remote remove origin \\
  && cd /workspace && bun install --frozen-lockfile
WORKDIR /workspace`,
});
