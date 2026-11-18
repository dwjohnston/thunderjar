/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiFAvaM4X8UPgmvECj
 *
 * Humans: add your notes here
 */

// The branch store: each session's records as commits on one branch, `refs/heads/thunderjar-capture/<session>`,
// for remotes that take only branches, e.g. Claude Code's cloud sessions, whose GitHub proxy pushes
// nothing outside refs/heads/. Git won't point a branch at a tag object, so the record is in the commit.
//
// One commit per record, oldest first, each the parent of the next:
//
//   thunderjar capture: <session> start       tree: the start snapshot, no parent
//   thunderjar capture: <session> turn-1      tree: turn 1's snapshot, parent: start's commit
//   …
//
// The message is that first line, a blank line, then the record as JSON, as in the refs store's tags.
// A record is only ever appended: update-ref checks the old tip, so the branch only fast-forwards.
import {
  commitTree,
  git,
  gitSucceeds,
  parseRecord,
  type RefKind,
  recordSubject,
  refExists,
  refName,
  tryGit,
  writeRecord,
} from "./git.ts";
import type { StartRecord, TurnRecord } from "./records.ts";

export const BRANCH_PREFIX = "refs/heads/thunderjar-capture";

/** The session's branch. Checks the session ID as `refName` does. */
export function branchName(sessionId: string): string {
  refName(sessionId, "start");
  return `${BRANCH_PREFIX}/${sessionId}`;
}

export type BranchEntry = { kind: RefKind; commit: string; tree: string; committedAt: string; record: StartRecord | TurnRecord };

const SUBJECT = /^thunderjar capture: \S+ (start|turn-\d+)$/;

/** The session's records on its branch, oldest first. Empty without the branch. */
export function readBranch(root: string, sessionId: string): BranchEntry[] {
  const branch = branchName(sessionId);
  if (!refExists(root, branch)) return [];
  // -z ends each commit with NUL; %x00 splits its fields. A JSON record never holds a NUL.
  const fields = git(root, ["log", "-z", "--first-parent", "--reverse", "--format=%H%x00%T%x00%cI%x00%B", branch]).split("\0");
  const entries: BranchEntry[] = [];
  for (let i = 0; i + 3 < fields.length; i += 4) {
    const [commit, tree, committedAt, message] = [fields[i]!.trim(), fields[i + 1]!, fields[i + 2]!, fields[i + 3]!];
    const kind = message.split("\n")[0]?.match(SUBJECT)?.[1] as RefKind | undefined;
    if (!kind) continue;
    entries.push({ kind, commit, tree, committedAt, record: parseRecord(message) });
  }
  return entries;
}

/** Whether the session has a branch, whose first commit is its start. */
export function branchHasStart(root: string, sessionId: string): boolean {
  return refExists(root, branchName(sessionId));
}

/** The number of the session's next turn on its branch: one more than the tip's. */
export function branchNextTurn(root: string, sessionId: string): number {
  const subject = tryGit(root, ["log", "-1", "--format=%s", branchName(sessionId)]) ?? "";
  return Number(subject.match(SUBJECT)?.[1]?.match(/^turn-(\d+)$/)?.[1] ?? 0) + 1;
}

/**
 * Appends a record to the session's branch: a commit of `tree`, whose parent is the branch's tip. `start`
 * creates the branch, and fails if it exists; a turn fails without it. Never moves the branch except
 * forward, and fails if another write moved it first.
 */
export function appendBranchRecord(root: string, sessionId: string, kind: RefKind, tree: string, record: StartRecord | TurnRecord): string {
  const branch = branchName(sessionId);
  const tip = kind === "start" ? null : git(root, ["rev-parse", "--verify", `${branch}^{commit}`]);
  const commit = commitTree(root, tree, [tip], `${recordSubject(sessionId, kind)}\n\n${JSON.stringify(record, null, 2)}\n`);
  // The old value, or empty for none, makes update-ref fail unless the branch is still where we read it.
  git(root, ["update-ref", "-m", "thunderjar capture", branch, commit, tip ?? ""]);
  return commit;
}

/** The session IDs that have a branch. */
export function branchSessions(root: string): string[] {
  return git(root, ["for-each-ref", "--format=%(refname)", `${BRANCH_PREFIX}/`])
    .split("\n")
    .filter(Boolean)
    .map((ref) => ref.slice(BRANCH_PREFIX.length + 1));
}

export type ImportResult = { imported: string[]; skipped: string[] };

/**
 * Copies every branch-store record into the refs store, as `refs/thunderjar/capture/<session>/<kind>`.
 * Never overwrites a ref that exists, so it can run again, and leaves the branches as they are.
 *
 * Each tag points at a new commit of the record's tree, as the hooks write them: its parent is the HEAD
 * the record names, where this repository has that commit, and its dates are the branch commit's.
 */
export function importBranches(root: string): ImportResult {
  const result: ImportResult = { imported: [], skipped: [] };
  for (const sessionId of branchSessions(root)) {
    for (const entry of readBranch(root, sessionId)) {
      const ref = refName(sessionId, entry.kind);
      if (refExists(root, ref)) {
        result.skipped.push(ref);
        continue;
      }
      const head = entry.record.kind === "start" ? entry.record.repository.headAtStart : entry.record.repository.headAtStop;
      const parent = head && gitSucceeds(root, ["cat-file", "-e", `${head}^{commit}`]) ? head : null;
      const dates = { GIT_AUTHOR_DATE: entry.committedAt, GIT_COMMITTER_DATE: entry.committedAt };
      const commit = commitTree(root, entry.tree, [parent], `${recordSubject(sessionId, entry.kind)}\n`, dates);
      writeRecord(root, ref, commit, entry.record);
      result.imported.push(ref);
    }
  }
  return result;
}
