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

// This repository at the commit that added src/gauntlet/tdd-refactor and src/gauntlet/tdd-feature,
// with its dependencies installed, so the agent works on them with the repo's everyday AGENTS.md
// and skills, red-green-tdd among them.
//
// The commit is the one before the tdd-* tasks were added to .thunderjar/, so the agent can't read
// their measurements. Keep it that way if you move it.
//
// It names the commit, not a tag: the session that wrote it couldn't push tags. To move it to the
// convention, push `tj-thunderjar-gauntlet-tdd` at this commit and resolve it, as
// thunderjar-gauntlet does. Sealed: origin is removed.
export default declareCodeState({
  config: {
    repo: "https://github.com/dwjohnston/thunderjar.git",
    commit: "d8ba1346abe7019b953d85e87bb3c9be4cc14b65",
  },
  applyParameter: (config) => `RUN git clone --quiet ${config.repo} /workspace \\
  && git -C /workspace fetch --quiet origin ${config.commit} \\
  && git -C /workspace checkout --quiet --detach ${config.commit} \\
  && git -C /workspace remote remove origin \\
  && cd /workspace && bun install --frozen-lockfile`,
});
