/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-fable-5-2
 * Session Id: 984d4e8d-dedf-41bb-a0a5-0471af869440
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */

import { declareCodeState } from "thunderjar-published";

// This repository at tag thunderjar/codestate/security-assessment: main as it was when the
// security-assessment task was written, with dependencies installed, so the agent has no need of the
// network. At that commit, API keys passed with `docker run -e` are kept by `docker commit` in the
// postrun image: the issue the task's measurement looks for.
//
// Sealed: no origin, and the tag is on a commit from before the task and its measurement were added.
// Keep it there, or the agent can read what's being measured. resolve looks up the tag's commit, so
// the Dockerfile pins a SHA.
export default declareCodeState({
  config: {
    repo: "https://github.com/dwjohnston/thunderjar.git",
    tag: "thunderjar/codestate/security-assessment",
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
  && git -C /workspace tag thunderjar-start \\
  && git -C /workspace remote remove origin \\
  && cd /workspace && bun install --frozen-lockfile
WORKDIR /workspace`,
});
