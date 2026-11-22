/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: session_01LCLeLiw2YB851n82Y1sd8t
 *
 * Humans: add your notes here
 */

// `thunderjar purge capture`: deletes captured sessions, in both stores, refs/thunderjar/capture/<session>/*
// and the thunderjar/capture/<session> branches. Says what it would delete, and asks first.
import { Command, Option } from "commander";
import { repoRoot } from "../../../capture/git.ts";
import { localCaptureRefs, VERDICTS, type Verdict } from "../../../capture/list.ts";
import {
  type CaptureSelection,
  deleteLocal,
  deleteRemote,
  fetchObjects,
  PURGE_FROM,
  type PurgeFrom,
  type PurgeTarget,
  readable,
  remoteCaptureRefs,
  selectionProblem,
  selectTargets,
} from "../../../capture/purge.ts";
import { type Paint, padEnd, painter, visibleLength } from "../../colour.ts";
import { confirm } from "../../confirm.ts";
import { plural } from "../../format.ts";
import { jsonOption } from "../../json.ts";
import { print, printError, printJson } from "../../output.ts";
import { olderThanOption } from "./age.ts";

type CaptureOptions = { from: PurgeFrom; remote: string; olderThan?: number; all?: boolean; verdict?: Verdict; yes?: boolean; dryRun?: boolean; json?: boolean };

/** Prints `message` as an error, with exit code 1. */
function fail(message: string): void {
  printError(message);
  process.exitCode = 1;
}

/** How long ago `iso` was, roughly: `12d`, `5h` or `40m`. */
function age(iso: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  if (minutes >= 1440) return `${Math.floor(minutes / 1440)}d`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h`;
  return `${minutes}m`;
}

/** The prompt's first line, cut to `width`. */
function firstLine(text: string, width: number): string {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > width ? `${line.slice(0, width - 1)}…` : line;
}

/** A line per session: its ID, verdict, age and prompt. `?` where its records weren't read. */
function targetLines(targets: PurgeTarget[], paint: Paint, now: number): string[] {
  const rows = targets.map(({ session, verdict, startedAt, prompt }) => [
    paint.bold(session),
    paint.magenta(verdict ?? "?"),
    paint.dim(startedAt === null ? "?" : age(startedAt, now)),
    prompt === null ? "" : JSON.stringify(firstLine(prompt, 60)),
  ]);
  const widths = [0, 1, 2].map((i) => Math.max(...rows.map((row) => visibleLength(row[i]!))));
  return rows.map((row) => row.map((cell, i) => (i < 3 ? padEnd(cell, widths[i]!) : cell)).join("  ").trimEnd());
}

async function purgeCapture(cwd: string, sessions: string[], options: CaptureOptions): Promise<void> {
  const selection: CaptureSelection = {
    sessions,
    all: options.all === true,
    ...(options.olderThan !== undefined && { olderThanMs: options.olderThan }),
    ...(options.verdict !== undefined && { verdict: options.verdict }),
  };
  const problem = selectionProblem(selection);
  if (problem) return fail(problem);
  const root = repoRoot(cwd);
  if (root === null) return fail("Not in a git repository: captures are kept in one.");
  const { from, remote } = options;
  const now = Date.now();
  const places = { local: from !== "remote", remote: from !== "local" };
  let targets: PurgeTarget[];
  try {
    const local = places.local ? localCaptureRefs(root) : [];
    const remoteRefs = places.remote ? remoteCaptureRefs(root, remote) : [];
    // --verdict and --older-than read the records, so fetch those of sessions never pulled.
    const needsRecords = selection.verdict !== undefined || selection.olderThanMs !== undefined;
    if (needsRecords) {
      const present = new Set(readable(root, remoteRefs));
      fetchObjects(root, remote, remoteRefs.filter((ref) => !present.has(ref)));
    }
    targets = selectTargets(root, { local, remote: remoteRefs }, [...local, ...readable(root, remoteRefs)], selection, now);
  } catch (error) {
    // An unknown session, or git failing to reach the remote.
    return fail(error instanceof Error ? error.message : String(error));
  }
  const report = (sessions: PurgeTarget[]) => options.json && printJson({ dryRun: options.dryRun === true, from, remote: places.remote ? remote : null, sessions });
  if (targets.length === 0) {
    print("Nothing to purge.");
    return void report([]);
  }
  for (const line of targetLines(targets, painter(), now)) print(line);
  if (options.dryRun) {
    print(`${plural(targets.length, "session")} would be deleted.`);
    return void report(targets);
  }
  if (!options.yes) {
    if (!process.stdin.isTTY) return fail("Not deleting without asking, and there's no terminal to ask on. Pass --yes to delete, or --dry-run to see what would be.");
    const where = !places.remote ? "" : places.local ? `, here and from ${remote}` : ` from ${remote}`;
    if (!(await confirm(`Delete them${where}?`))) return void print("Nothing was deleted.");
  }
  try {
    if (places.remote) deleteRemote(root, remote, targets.flatMap((target) => target.remote));
    if (places.local) deleteLocal(root, targets.flatMap((target) => target.local));
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
  print(`${plural(targets.length, "session")} deleted.`);
  report(targets);
}

export function createPurgeCaptureCommand(): Command {
  return new Command("capture")
    .description("Delete captured sessions, from both stores: refs/thunderjar/capture/<session>/* and the thunderjar/capture/<session> branches. Says what it would delete, and asks first.")
    .argument("[sessions...]", "the full IDs of the sessions to delete, as `capture list` shows them")
    .addOption(olderThanOption("sessions"))
    .option("--all", "every captured session")
    .addOption(new Option("--verdict <verdict>", "only sessions with this verdict, as `capture list` shows it").choices(VERDICTS))
    .addOption(new Option("--from <place>", "where from: this repository, the remote, or both").choices(PURGE_FROM).default("local"))
    .option("--remote <name>", "the remote, with --from remote or all", "origin")
    .option("-y, --yes", "don't ask first")
    .option("--dry-run", "only say what would be deleted")
    .addOption(jsonOption())
    .action(async (sessions: string[], options: CaptureOptions) => {
      await purgeCapture(process.cwd(), sessions, options);
    });
}
