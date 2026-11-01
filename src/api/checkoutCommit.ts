import type { ApplyParameterCtx } from "./declarations.ts";

// How checkoutCommit tells Thunderjar which commit to check out: a code state's ctx carries a
// function under this key. Symbol.for, so it is found even when the user's project resolves a
// different copy of this module.
export const CHECKOUT_COMMIT = Symbol.for("thunderjar.checkoutCommit");

/** A code state's ctx, as Thunderjar makes it. */
export type CheckoutCtx = ApplyParameterCtx & { [CHECKOUT_COMMIT]?: (commit: string) => void };

/**
 * Checks `commit`, a hash, out into `/workspace` as a real repository. For a code state's
 * `applyParameter` only.
 *
 * Thunderjar bundles the commit and its ancestors, and nothing after it, into the build context.
 * Straight after the base image's fragment, the prerun build clones it to `/workspace`, checks
 * the commit out detached, removes the remote, and sets a git identity so the agent can commit.
 * Those lines are Thunderjar's, so this returns an empty fragment, for the code state's own
 * lines to follow:
 *
 * ```ts
 * export default declareCodeState({
 *   config: { commit: "a1b2c3" },
 *   applyParameter: (config, ctx) => `${checkoutCommit(ctx, config.commit)}\nRUN npm ci`,
 * });
 * ```
 *
 * The commit must already be in the repository the project is in, or nothing is built.
 */
export function checkoutCommit(ctx: ApplyParameterCtx, commit: string): string {
  const checkout = (ctx as CheckoutCtx)[CHECKOUT_COMMIT];
  if (!checkout) throw new Error("checkoutCommit is only for a code state's applyParameter.");
  checkout(commit);
  return "";
}
