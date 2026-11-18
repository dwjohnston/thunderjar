/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareCodeState } from "thunderjar-published";

// Thunderjar at 091b441, the HEAD that capture 49669c7c-0a9d-468d-a0aa-fbeb2bc69840 started from
// (branch claude/zealous-thompson-v0dt99), with its dependencies installed.
// 091b441 isn't on any branch, so this checks out the capture's `start` commit, f47c87c, which has
// the same tree and is reachable from branch thunderjar-capture/49669c7c-…
export default declareCodeState({
  config: {
    repo: "https://github.com/dwjohnston/thunderjar.git",
    commit: "f47c87cdab2ee583c8af96c3383ed6443eeefb2c",
  },
  applyParameter: (config) => `RUN git clone --quiet ${config.repo} /workspace \\
  && git -C /workspace checkout --quiet --detach ${config.commit} \\
  && git -C /workspace remote remove origin \\
  && cd /workspace && bun install --frozen-lockfile`,
});
