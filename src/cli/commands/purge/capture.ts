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
import { type CaptureSelection, type PurgeTarget, selectTargets } from "../../../capture/purge.ts";
import { type Paint, padEnd, painter } from "../../colour.ts";
import { plural } from "../../format.ts";
import { print, printError } from "../../output.ts";

type CaptureOptions = { verdict?: Verdict; dryRun?: boolean };

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
  const widths = [0, 1, 2].map((i) => Math.max(...rows.map((row) => row[i]!.length)));
  return rows.map((row) => row.map((cell, i) => (i < 3 ? padEnd(cell, widths[i]!) : cell)).join("  ").trimEnd());
}

async function purgeCapture(cwd: string, options: CaptureOptions): Promise<void> {
  const root = repoRoot(cwd);
  if (root === null) return fail("Not in a git repository: captures are kept in one.");
  const selection: CaptureSelection = { sessions: [], all: false, ...(options.verdict !== undefined && { verdict: options.verdict }) };
  const now = Date.now();
  const local = localCaptureRefs(root);
  const targets = selectTargets(root, { local, remote: [] }, local, selection, now);
  if (targets.length === 0) return void print("Nothing to purge.");
  for (const line of targetLines(targets, painter(), now)) print(line);
  if (options.dryRun) return void print(`${plural(targets.length, "session")} would be deleted.`);
}

export function createPurgeCaptureCommand(): Command {
  return new Command("capture")
    .description("Delete captured sessions, from both stores: refs/thunderjar/capture/<session>/* and the thunderjar/capture/<session> branches. Says what it would delete, and asks first.")
    .addOption(new Option("--verdict <verdict>", "only sessions with this verdict, as `capture list` shows it").choices(VERDICTS))
    .option("--dry-run", "only say what would be deleted")
    .action(async (options: CaptureOptions) => {
      await purgeCapture(process.cwd(), options);
    });
}
