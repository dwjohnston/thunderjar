// `codeStateGitCheckout`: a whole code state for a commit, a branch or a tag of a git repository.
//
//   export default codeStateGitCheckout({ repo, commit: "530f477…" });
//   export default codeStateGitCheckout({ repo, branch: "main" });
//   export default codeStateGitCheckout({ repo, tag: "v0.4.0" });
//
// A branch or tag is pinned to a commit by `resolve`, with `git ls-remote` on the host, so the
// Dockerfile names a SHA: a moved branch changes the hash, and a stale image is never reused. The
// run records the commit. The commit is fetched directly, not cloned with its branch, so a commit
// that no branch holds any more (squash-merged) still works, on hosts that allow it (GitHub does).
import { declareCodeState, type CodeStateDeclaration } from "./declarations.ts";

/** A bare `ref` string would be ambiguous (`abc123` could be a branch), so there are three keys, one at a time. */
export type CodeStateGitCheckoutConfig = { repo: string } & (
  | { commit: string; branch?: never; tag?: never }
  | { branch: string; commit?: never; tag?: never }
  | { tag: string; commit?: never; branch?: never }
);

/** The commit a branch or tag names, or the commit itself. */
export async function resolveGitCheckout(config: CodeStateGitCheckoutConfig, ctx: { exec(command: string): Promise<string> }): Promise<string> {
  if (config.commit !== undefined) return config.commit;
  // Tags are peeled (^{}), so an annotated tag gives its commit, not its own object.
  const refs = config.branch !== undefined ? [`refs/heads/${config.branch}`] : [`refs/tags/${config.tag}`, `refs/tags/${config.tag}^{}`];
  const lines = (await ctx.exec(`git ls-remote --exit-code ${config.repo} ${refs.map((ref) => `'${ref}'`).join(" ")}`)).split("\n");
  const line = lines.find((l) => l.endsWith("^{}")) ?? lines[0]!;
  return line.split("\t")[0]!;
}

export function codeStateGitCheckout(config: CodeStateGitCheckoutConfig): CodeStateDeclaration<CodeStateGitCheckoutConfig, string> {
  return declareCodeState<CodeStateGitCheckoutConfig, string>({
    config,
    resolve: resolveGitCheckout,
    applyParameter: (config, ctx) => `RUN git clone --quiet ${config.repo} /workspace \\
  && git -C /workspace fetch --quiet origin ${ctx.resolved} \\
  && git -C /workspace checkout --quiet --detach ${ctx.resolved} \\
  && git -C /workspace remote remove origin`,
  });
}
