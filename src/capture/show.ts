/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 *
 * Humans: add your notes here
 */

// One captured session's records, from whichever store its start is in, for `thunderjar capture show`:
// to read a capture, or paste it under a pull request. Records only, never the snapshot trees.
import { branchName } from "./branch.ts";
import { type RefKind, recordSubject, refName } from "./git.ts";
import type { StartRecord, TurnRecord } from "./records.ts";
import { nextTurnIn, readRecordIn, type StoreKind, startedIn } from "./store.ts";

export type ShownRecord = { subject: string; record: StartRecord | TurnRecord };
export type ShownCapture = { session: string; store: StoreKind; records: ShownRecord[] };

/** The session's records, start first, then its turns in order. Null when neither store has its start. */
export function showCapture(root: string, session: string): ShownCapture | null {
  try {
    refName(session, "start");
  } catch {
    return null;
  }
  const store = startedIn(root, session);
  if (store === null) return null;
  const kinds: RefKind[] = ["start"];
  for (let turn = 1; turn < nextTurnIn(root, store, session); turn++) kinds.push(`turn-${turn}`);
  const records = kinds.map((kind) => ({ subject: recordSubject(session, kind), record: readRecordIn<StartRecord | TurnRecord>(root, store, session, kind) }));
  return { session, store, records };
}

/** How someone else fetches the session from `origin`, once it's pushed. */
export function fetchHint({ session, store }: Pick<ShownCapture, "session" | "store">): string {
  if (store === "branch") return `git fetch origin ${branchName(session)}:${branchName(session)}`;
  const prefix = refName(session, "start").slice(0, -"start".length);
  return `git fetch origin '${prefix}*:${prefix}*'`;
}

/** Plain text: a header, then each record as its subject and JSON. */
export function formatCapture(capture: ShownCapture): string {
  const header = [`Session: ${capture.session}`, `Store: ${capture.store}`, `Fetch: ${fetchHint(capture)}`];
  const records = capture.records.map(({ subject, record }) => `${subject}\n${JSON.stringify(record, null, 2)}`);
  return [header.join("\n"), ...records].join("\n\n");
}
