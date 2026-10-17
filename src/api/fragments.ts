// Dockerfile fragments a parameter's `applyParameter` can use, exported from `thunderjar`.

import type { GitBuildContext } from "./declarations.ts";

/**
 * Checks `commit` out into /workspace as a real repository — spec/062-code-state.md#how-the-code-gets-into-the-image:
 * cloned from a bundle of the commit and its ancestors only (so `git log --all` shows the agent
 * nothing after it), detached, with no remote, and a git identity so the agent can commit.
 *
 * ```ts
 * export default declareCodeState({
 *   config: { commit: "a1b2c3" },
 *   applyParameter: (config, ctx) => `${checkoutCommit(ctx, config.commit)}\nRUN npm ci`,
 * });
 * ```
 */
export function checkoutCommit(ctx: { git: GitBuildContext }, commit: string): string {
  return [
    `COPY ${ctx.git.bundle(commit)} /tmp/code.bundle`,
    [
      "RUN git clone --quiet /tmp/code.bundle /workspace",
      `git -C /workspace checkout --quiet --detach ${commit}`,
      "git -C /workspace branch --quiet --delete --force code-state",
      "git -C /workspace remote remove origin",
      `git -C /workspace config user.name "Thunderjar agent"`,
      "git -C /workspace config user.email agent@thunderjar.invalid",
      "rm /tmp/code.bundle",
    ].join(" \\\n  && "),
  ].join("\n");
}
