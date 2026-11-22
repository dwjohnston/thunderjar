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

// The same start as thunderjar-implement-4100-capture, plus one commit that drops the redundant
// WORKDIR /workspace and cd /workspace from the code states: Thunderjar already sets WORKDIR /workspace
// before the code state. Does the agent then convert more of them to codeStateGitCheckout?
export default declareCodeState({
  config: {
    repo: "https://github.com/dwjohnston/thunderjar.git",
    tag: "tj-thunderjar-implement-4100-no-workdir",
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
