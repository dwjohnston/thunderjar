/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: 2c687305-6347-4bf9-986d-08bb47278936
 *
 * Humans: add your notes here
 */

// Pushing the captures to a remote, or fetching them from it, in both stores. Capture refs are added and
// never moved, and capture branches only fast-forward, so neither direction needs --force.
import { BRANCH_PREFIX, branchName, branchSessions } from "./branch.ts";
import { git, REF_PREFIX } from "./git.ts";
import { STORES, type StoreKind } from "./store.ts";

export const REFSPECS: Record<StoreKind, string> = {
  refs: `${REF_PREFIX}/*:${REF_PREFIX}/*`,
  branch: `${BRANCH_PREFIX}/*:${BRANCH_PREFIX}/*`,
};

export type PushOptions = { fetch: boolean; remote: string };

/** The stores this repository has captures in. */
export function localStores(root: string): StoreKind[] {
  const hasRefs = git(root, ["for-each-ref", "--count=1", "--format=%(refname)", `${REF_PREFIX}/`]) !== "";
  return STORES.filter((store) => (store === "refs" ? hasRefs : branchSessions(root).length > 0));
}

/**
 * The git arguments that push the captures in `stores` to a remote, or fetch both stores from it.
 * A push names only the stores that have captures: git fails on a refspec that matches nothing, and a
 * remote that takes only branches rejects the refs store. Null when there's nothing to push.
 */
export function pushArgs({ fetch, remote }: PushOptions, stores: readonly StoreKind[]): string[] | null {
  if (fetch) return ["fetch", remote, ...STORES.map((store) => REFSPECS[store])];
  if (stores.length === 0) return null;
  // --no-verify: the repository's pre-push hooks are about branches, not records.
  return ["push", "--no-verify", remote, ...stores.map((store) => REFSPECS[store])];
}

/** Pushes or fetches the captures. Returns git's output, or null when there was nothing to push. */
export function push(root: string, options: PushOptions): string | null {
  const args = pushArgs(options, localStores(root));
  return args ? git(root, args) : null;
}

/** The git arguments that push one session's capture from its `store`. */
export function sessionPushArgs(remote: string, store: StoreKind, sessionId: string): string[] {
  const ref = store === "refs" ? `${REF_PREFIX}/${sessionId}/*` : branchName(sessionId);
  return ["push", "--no-verify", remote, `${ref}:${ref}`];
}
