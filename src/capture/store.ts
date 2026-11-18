/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiFAvaM4X8UPgmvECj
 *
 * Humans: add your notes here
 */

// Where the hooks write a session's records: the refs store, one annotated tag per record under
// refs/thunderjar/capture/<session>/, or the branch store, one commit per record on
// refs/heads/thunderjar/capture/<session> (see branch.ts). `THUNDERJAR_CAPTURE_STORE` picks one for new
// sessions; a session stays in the store its start is in. Readers read both, whatever it says.
import { appendBranchRecord, branchHasStart, branchName, branchNextTurn, readBranch } from "./branch.ts";
import type { Env } from "./files.ts";
import { commitTree, nextTurn, type RefKind, readRecord, recordSubject, refExists, refName, writeRecord } from "./git.ts";
import type { StartRecord, TurnRecord } from "./records.ts";

export const STORES = ["refs", "branch"] as const;
export type StoreKind = (typeof STORES)[number];

/**
 * The store for new sessions: `THUNDERJAR_CAPTURE_STORE` when set, else `branch` in a Claude Code cloud
 * session (`CLAUDE_CODE_REMOTE=true`), whose GitHub proxy pushes only branches, else `refs`.
 * Throws for any other value, which a hook logs.
 */
export function configuredStore(env: Env): StoreKind {
  const value = env.THUNDERJAR_CAPTURE_STORE?.trim().toLowerCase();
  if (value) {
    if ((STORES as readonly string[]).includes(value)) return value as StoreKind;
    throw new Error(`THUNDERJAR_CAPTURE_STORE is ${JSON.stringify(env.THUNDERJAR_CAPTURE_STORE)}: use ${STORES.join(" or ")}`);
  }
  return env.CLAUDE_CODE_REMOTE?.trim().toLowerCase() === "true" ? "branch" : "refs";
}

/** The store the session's start is in, if any. */
export function startedIn(root: string, sessionId: string): StoreKind | null {
  if (refExists(root, refName(sessionId, "start"))) return "refs";
  if (branchHasStart(root, sessionId)) return "branch";
  return null;
}

/** The number of the session's next turn in `store`. */
export function nextTurnIn(root: string, store: StoreKind, sessionId: string): number {
  return store === "refs" ? nextTurn(root, sessionId) : branchNextTurn(root, sessionId);
}

/** The session's `kind` record in `store`. Throws when it has none. */
export function readRecordIn<T extends StartRecord | TurnRecord>(root: string, store: StoreKind, sessionId: string, kind: RefKind): T {
  if (store === "refs") return readRecord<T>(root, refName(sessionId, kind));
  const entry = readBranch(root, sessionId).find((candidate) => candidate.kind === kind);
  if (!entry) throw new Error(`no ${kind} for session ${sessionId} on its branch`);
  return entry.record as T;
}

/**
 * Writes a record of the snapshot `tree` into `store`. In the refs store, a commit of `tree` whose parent is
 * `head`, under a tag at the record's ref; in the branch store, a commit appended to the session's branch.
 * Returns the ref written, a tag ref or the session's branch, and the record's commit.
 */
export function writeRecordIn(
  root: string,
  store: StoreKind,
  sessionId: string,
  kind: RefKind,
  tree: string,
  head: string | null,
  record: StartRecord | TurnRecord,
): { ref: string; commit: string } {
  if (store === "branch") {
    const commit = appendBranchRecord(root, sessionId, kind, tree, record);
    return { ref: branchName(sessionId), commit };
  }
  const ref = refName(sessionId, kind);
  const commit = commitTree(root, tree, [head], `${recordSubject(sessionId, kind)}\n`);
  writeRecord(root, ref, commit, record);
  return { ref, commit };
}
