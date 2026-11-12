/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLihXvsaKQZdBjhN81n
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareCodeState } from "thunderjar-published";

// This repository at the commit that added src/gauntlet, with its dependencies installed, so the
// agent works on a gauntlet challenge with the repo's everyday AGENTS.md, skills and tooling.
//
// The commit is the one before the gauntlet's task and test cases were added to .thunderjar/, so
// the agent can't read their measurements. Keep it that way if you move it: only the challenges in
// src/gauntlet need to be in it, not a newer Thunderjar.
//
// The commit is fetched by its SHA, so the build still finds it once its branch is squash-merged
// and deleted: GitHub keeps it under the pull request's ref.
export default declareCodeState({
  config: {
    repo: "https://github.com/dwjohnston/thunderjar.git",
    commit: "48ac1e10a9ad5050b5ddbc50e17983da36e64544",
  },
  applyParameter: (config) => `RUN git clone --quiet ${config.repo} /workspace \\
  && git -C /workspace fetch --quiet origin ${config.commit} \\
  && git -C /workspace checkout --quiet --detach ${config.commit} \\
  && git -C /workspace remote remove origin \\
  && cd /workspace && bun install --frozen-lockfile`,
});
