/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: 2c687305-6347-4bf9-986d-08bb47278936
 *
 * Humans: add your notes here
 */

// The captures in a repository, each with a verdict, to triage which would make good evals.
//
// Verdicts, the first that applies:
//   incomplete     a start ref with no turns
//   question       the last turn's tree is the same as start's tree
//   rewritten      historyRewritten on any turn
//   one-shot       1 turn
//   few-shot       2-3 turns
//   conversation   more than 3 turns
import { git, REF_PREFIX, readRecord } from "./git.ts";
import type { StartRecord, TurnRecord } from "./records.ts";

export type Verdict = "incomplete" | "question" | "rewritten" | "one-shot" | "few-shot" | "conversation";

/** The most turns a `few-shot` capture can have. A first guess: change it freely. */
export const FEW_SHOT_MAX_TURNS = 3;

export type Capture = {
  session: string;
  verdict: Verdict;
  turns: number;
  startedAt: string;
  prompt: string;
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

/** Every capture in the repository, oldest first. */
export function listCaptures(root: string): Capture[] {
  const refs = git(root, ["for-each-ref", "--format=%(refname)", `${REF_PREFIX}/`]).split("\n").filter(Boolean);
  const bySession = new Map<string, { start?: string; turns: Map<number, string> }>();
  for (const ref of refs) {
    const [session, kind] = ref.slice(REF_PREFIX.length + 1).split("/");
    if (!session || !kind) continue;
    const entry: { start?: string; turns: Map<number, string> } = bySession.get(session) ?? { turns: new Map() };
    bySession.set(session, entry);
    const turn = kind.match(/^turn-(\d+)$/)?.[1];
    if (kind === "start") entry.start = ref;
    else if (turn) entry.turns.set(Number(turn), ref);
  }

  const captures: Capture[] = [];
  for (const [session, refsOf] of bySession) {
    if (!refsOf.start) continue;
    const start = readRecord<StartRecord>(root, refsOf.start);
    const turnRefs = [...refsOf.turns.entries()].sort(([a], [b]) => a - b).map(([, ref]) => ref);
    const turnRecords = turnRefs.map((ref) => readRecord<TurnRecord>(root, ref));
    const startTree = git(root, ["rev-parse", `${refsOf.start}^{tree}`]);
    const lastRef = turnRefs.at(-1);
    const lastTree = lastRef ? git(root, ["rev-parse", `${lastRef}^{tree}`]) : null;
    const capture = { startTree, lastTree, turnRecords };
    captures.push({
      session,
      verdict: verdictOf(capture),
      turns: turnRecords.length,
      startedAt: start.capturedAt,
      prompt: start.prompt,
      start,
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
