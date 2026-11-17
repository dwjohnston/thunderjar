/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLkf5f7yremSqsRgCrm
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareCodeState } from "thunderjar-published";

// This repository at the tag tj-codestate-thunderjar-1, with its dependencies installed, so
// measurements can run its typecheck and tests.
//
// `resolve` looks up the commit the tag names when the execution starts, so the image is hashed by
// commit: moving the tag builds a new image. The local tag is reset to that commit, so measurements
// can diff against the tag even if it has moved since.
export default declareCodeState({
  config: {
    repo: "https://github.com/dwjohnston/thunderjar.git",
    tag: "tj-codestate-thunderjar-1",
  },
  resolve: async (config, ctx) => {
    const tagRef = `refs/tags/${config.tag}`;
    // An annotated tag lists twice: the tag object, then the commit it peels to, as `^{}`.
    const lines = (await ctx.exec(`git ls-remote ${config.repo} '${tagRef}' '${tagRef}^{}'`)).split("\n");
    const line = lines.find((l) => l.endsWith("^{}")) ?? lines[0];
    const commit = line?.split("\t")[0];
    if (!commit) throw new Error(`Tag ${config.tag} not found in ${config.repo}`);
    return commit;
  },
  applyParameter: (config, ctx) => `RUN git clone --quiet ${config.repo} /workspace \\
  && git -C /workspace fetch --quiet origin ${ctx.resolved} \\
  && git -C /workspace checkout --quiet --detach ${ctx.resolved} \\
  && git -C /workspace tag --force ${config.tag} ${ctx.resolved} \\
  && git -C /workspace remote remove origin \\
  && cd /workspace && bun install --frozen-lockfile`,
});
