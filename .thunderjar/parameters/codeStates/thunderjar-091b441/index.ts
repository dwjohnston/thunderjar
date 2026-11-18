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
export default declareCodeState({
  config: {
    repo: "https://github.com/dwjohnston/thunderjar.git",
    commit: "091b441ab1eb50b6629cff066ca1676b144b926c",
  },
  applyParameter: (config) => `RUN git clone --quiet ${config.repo} /workspace \\
  && git -C /workspace checkout --quiet --detach ${config.commit} \\
  && git -C /workspace remote remove origin \\
  && cd /workspace && bun install --frozen-lockfile`,
});
