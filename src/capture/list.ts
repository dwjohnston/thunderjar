/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: 2c687305-6347-4bf9-986d-08bb47278936
 *
 * Humans: add your notes here
 */

// The captures in a repository, from both stores, each with a verdict, to triage which would make good evals.
//
// Verdicts, the first that applies:
//   incomplete     a start with no turns
//   question       the last turn's tree is the same as start's tree
//   rewritten      historyRewritten on any turn
//   one-shot       1 turn
//   few-shot       2-3 turns
//   conversation   more than 3 turns
import { BRANCH_PREFIX, readBranchAt } from "./branch.ts";
import { git, parseRecord, REF_PREFIX } from "./git.ts";
import type { StartRecord, TurnRecord } from "./records.ts";
import { STORES, type StoreKind } from "./store.ts";

export const VERDICTS = ["incomplete", "question", "rewritten", "one-shot", "few-shot", "conversation"] as const;
export type Verdict = (typeof VERDICTS)[number];

/** The most turns a `few-shot` capture can have. A first guess: change it freely. */
export const FEW_SHOT_MAX_TURNS = 3;

export type Capture = {
  session: string;
  verdict: Verdict;
  turns: number;
  startedAt: string;
  prompt: string;
  /** The stores holding the session's records: both once `capture import` has copied a branch. */
  stores: StoreKind[];
  startTree: string;
  lastTree: string | null;
  start: StartRecord;
  turnRecords: TurnRecord[];
};

export function verdictOf(capture: Pick<Capture, "startTree" | "lastTree" | "turnRecords">): Verdict {
  const turns = capture.turnRecords.length;
  if (turns === 0) return "incomplete";
  if (capture.lastTree === capture.startTree) return "question";
  if (capture.turnRecords.some((turn) => turn.repository.historyRewritten)) return "rewritten";
  if (turns === 1) return "one-shot";
  if (turns <= FEW_SHOT_MAX_TURNS) return "few-shot";
  return "conversation";
}

type Stored<T> = { record: T; tree: string };
type SessionRecords = { start?: Stored<StartRecord>; turns: Map<number, Stored<TurnRecord>>; stores: Set<StoreKind> };

/** A capture ref, in either store, and the object it points at: a tag in the refs store, a commit in the branch store. */
export type CaptureRef = { ref: string; oid: string };

/** The session and store of a capture ref, and in the refs store its record's kind. Undefined for any other ref. */
export function parseCaptureRef(ref: string): { session: string; store: StoreKind; kind?: string } | undefined {
  if (ref.startsWith(`${BRANCH_PREFIX}/`)) {
    const session = ref.slice(BRANCH_PREFIX.length + 1);
    return session && !session.includes("/") ? { session, store: "branch" } : undefined;
  }
  if (!ref.startsWith(`${REF_PREFIX}/`)) return undefined;
  const [session, kind, ...rest] = ref.slice(REF_PREFIX.length + 1).split("/");
  return session && kind && rest.length === 0 ? { session, store: "refs", kind } : undefined;
}

/** The capture refs in this repository, in both stores. */
export function localCaptureRefs(root: string): CaptureRef[] {
  return git(root, ["for-each-ref", "--format=%(refname) %(objectname)", `${REF_PREFIX}/`, `${BRANCH_PREFIX}/`])
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [ref, oid] = line.split(" ");
      return { ref: ref!, oid: oid! };
    });
}

/** The records in the refs store, by session. */
function readRefsStore(root: string, refs: CaptureRef[], into: Map<string, SessionRecords>) {
  for (const { ref, oid } of refs) {
    const parsed = parseCaptureRef(ref);
    if (parsed?.store !== "refs") continue;
    const { session, kind } = parsed;
    const turn = kind!.match(/^turn-(\d+)$/)?.[1];
    if (kind !== "start" && !turn) continue;
    const entry = sessionOf(into, session);
    entry.stores.add("refs");
    const stored = { record: parseRecord(git(root, ["cat-file", "tag", oid])), tree: git(root, ["rev-parse", `${oid}^{tree}`]) };
    if (kind === "start") entry.start = stored as Stored<StartRecord>;
    else entry.turns.set(Number(turn), stored as Stored<TurnRecord>);
  }
}

/** The records in the branch store, by session. A record the refs store has too is left as the refs store has it. */
function readBranchStore(root: string, refs: CaptureRef[], into: Map<string, SessionRecords>) {
  for (const { ref, oid } of refs) {
    const parsed = parseCaptureRef(ref);
    if (parsed?.store !== "branch") continue;
    const entry = sessionOf(into, parsed.session);
    entry.stores.add("branch");
    for (const { record, tree } of readBranchAt(root, oid)) {
      if (record.kind === "start") entry.start ??= { record, tree };
      else if (!entry.turns.has(record.turn)) entry.turns.set(record.turn, { record, tree });
    }
  }
}

function sessionOf(sessions: Map<string, SessionRecords>, session: string): SessionRecords {
  const entry = sessions.get(session) ?? { turns: new Map(), stores: new Set<StoreKind>() };
  sessions.set(session, entry);
  return entry;
}

/** Every capture in the repository, from both stores, merged by session, oldest first. */
export function listCaptures(root: string): Capture[] {
  return capturesOf(root, localCaptureRefs(root));
}

/**
 * The captures `refs` hold, merged by session, oldest first. Their objects must be in this repository, but
 * the refs needn't be, e.g. a remote's, fetched without refs. A session with no start record is left out.
 */
export function capturesOf(root: string, refs: CaptureRef[]): Capture[] {
  const sessions = new Map<string, SessionRecords>();
  readRefsStore(root, refs, sessions);
  readBranchStore(root, refs, sessions);

  const captures: Capture[] = [];
  for (const [session, { start, turns, stores }] of sessions) {
    if (!start) continue;
    const ordered = [...turns.entries()].sort(([a], [b]) => a - b).map(([, turn]) => turn);
    const turnRecords = ordered.map((turn) => turn.record);
    const capture = { startTree: start.tree, lastTree: ordered.at(-1)?.tree ?? null, turnRecords };
    captures.push({
      session,
      verdict: verdictOf(capture),
      turns: turnRecords.length,
      startedAt: start.record.capturedAt,
      prompt: start.record.prompt,
      stores: STORES.filter((store) => stores.has(store)),
      start: start.record,
      ...capture,
    });
  }
  return captures.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

function firstLine(text: string, width: number): string {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > width ? `${line.slice(0, width - 1)}…` : line;
}

export function formatTable(captures: Capture[]): string {
  if (captures.length === 0) return "No captures. Turn capture on with `thunderjar capture install --harness <harness>`.";
  const rows = captures.map((capture) => [
    capture.startedAt.slice(0, 16).replace("T", " "),
    capture.start.agent.harness,
    capture.verdict,
    String(capture.turns),
    capture.session,
    firstLine(capture.prompt, 60),
  ]);
  const header = ["Started", "Harness", "Verdict", "Turns", "Session", "Prompt"];
  const widths = header.map((title, column) => Math.max(title.length, ...rows.map((row) => row[column]!.length)));
  return [header, ...rows].map((row) => row.map((cell, column) => cell.padEnd(widths[column]!)).join("  ").trimEnd()).join("\n");
}
