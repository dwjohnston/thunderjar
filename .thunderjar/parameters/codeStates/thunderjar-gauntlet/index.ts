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
// resolve looks up the tag's commit, so the Dockerfile pins a SHA.
export default declareCodeState({
  config: {
    repo: "https://github.com/dwjohnston/thunderjar.git",
    tag: "tj-thunderjar-gauntlet",
  },
  resolve: async (config, ctx) => {
    const tag = `refs/tags/${config.tag}`;
    const lines = (await ctx.exec(`git ls-remote --exit-code ${config.repo} ${tag} '${tag}^{}'`)).split("\n");
    // An annotated tag lists its own object, then the commit it points to, with ^{}.
    const line = lines.find((l) => l.endsWith("^{}")) ?? lines[0]!;
    return line.split("\t")[0]!;
  },
  applyParameter: (config, ctx) => `RUN git clone --quiet ${config.repo} /workspace \\
  && git -C /workspace fetch --quiet origin ${ctx.resolved} \\
  && git -C /workspace checkout --quiet --detach ${ctx.resolved} \\
  && git -C /workspace remote remove origin \\
  && cd /workspace && bun install --frozen-lockfile`,
});
