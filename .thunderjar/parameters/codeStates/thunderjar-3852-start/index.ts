/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareCodeState } from "thunderjar";

// This repository at 242388c8, main where PR #282 started: task
// project-md/delivery/tasks/3852_claude-code-helper-provider.md is ready, and claudeCode() has no
// provider yet. Dependencies are installed, so the agent can run the tests and the typecheck.
//
// The commit is from before the claude-code-helper-provider task was added to .thunderjar/, so the
// agent can't read its measurements. Keep it that way if you move it.
//
// It names the commit, not a tag: the session that wrote it couldn't push tags. To move it to the
// convention, push `tj-thunderjar-3852-start` at this commit and resolve it, as
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
