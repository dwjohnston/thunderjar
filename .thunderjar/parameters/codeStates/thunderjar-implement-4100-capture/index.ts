/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: 4511dc95-fc84-44af-8f8e-ed60e60e2283
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareCodeState } from "thunderjar";

// This repository as the ralph loop's session for task 4100 (PR #237) started: the capture's start
// snapshot, of ebed545 (ralph/4000_tag-starting-commit), with dependencies installed. Its code states
// end with a redundant WORKDIR /workspace, which kept the agent from converting thunderjar-humans-md.
export default declareCodeState({
  config: {
    repo: "https://github.com/dwjohnston/thunderjar.git",
    tag: "thunderjar/codestate/thunderjar-implement-4100-capture",
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
  && bun install --frozen-lockfile`,
});
