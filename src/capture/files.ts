/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: c5299d71-1f4b-4472-9950-df42605e10cc
 *
 * Humans: add your notes here
 */

// Pending prompts, the capture log, and Claude Code's transcript: the files a hook reads and writes
// besides the refs.
import { captureDir, repoRoot } from "./git.ts";

export type Env = Record<string, string | undefined>;

// --- pending prompts ---

/** Where a prompt hook leaves the prompts of a later turn for the stop hook. */
export function pendingPath(root: string, sessionId: string): string {
  return `${captureDir(root)}/${sessionId}/pending.json`;
}

export type Pending = { prompts: { text: string; submittedAt: string }[] };

export async function readPending(root: string, sessionId: string): Promise<Pending> {
  const file = Bun.file(pendingPath(root, sessionId));
  return (await file.exists()) ? ((await file.json()) as Pending) : { prompts: [] };
}

/**
 * Adds a prompt to the pending file. A turn can have more than one, e.g. when the user interrupts the agent:
 * Claude Code doesn't run the Stop hook then, so the next prompt joins the same turn.
 */
export async function addPending(root: string, sessionId: string, text: string) {
  const pending = await readPending(root, sessionId);
  pending.prompts.push({ text, submittedAt: new Date().toISOString() });
  await Bun.write(pendingPath(root, sessionId), `${JSON.stringify(pending, null, 2)}\n`, { createPath: true });
}

/** Deletes the pending file, once the turn that holds its prompts is recorded. */
export async function clearPending(root: string, sessionId: string) {
  await Bun.file(pendingPath(root, sessionId)).delete().catch(() => {});
}

// --- logging ---

/** Where the hooks log: `.thunderjar/logs/` in the repository, which thunderjar gitignores. */
export function logDir(root: string): string {
  return `${root}/.thunderjar/logs`;
}

async function appendLog(cwd: string, hook: string, message: string) {
  try {
    const root = repoRoot(cwd);
    if (!root) return;
    // pino's destination appends, as Bun's own file API can't. Imported here, so a hook that logs nothing never loads it.
    const { default: pino } = await import("pino");
    const file = pino.destination({ dest: `${logDir(root)}/capture.log`, mkdir: true, sync: true, append: true });
    file.write(`${new Date().toISOString()} ${hook}: ${message}\n`);
    file.end();
  } catch {
    // Nothing more to do: a hook must never fail the session.
  }
}

/**
 * Appends a failure to `.thunderjar/logs/capture.log`. The hooks never fail the session, so this is
 * where their errors go. Outside a git repository there's nowhere to write, and the error is dropped.
 */
export async function logError(cwd: string, hook: string, error: unknown) {
  await appendLog(cwd, hook, error instanceof Error ? (error.stack ?? error.message) : String(error));
}

export type Log = (message: string) => Promise<void>;

/**
 * A logger for one hook run. With `THUNDERJAR_CAPTURE_LOG_LEVEL=verbose` it appends each message to
 * `.thunderjar/logs/capture.log`; otherwise it does nothing. Never stdout: a harness may add that to
 * the agent's context.
 */
export function verboseLogger(cwd: string, hook: string, env: Env): Log {
  if (env.THUNDERJAR_CAPTURE_LOG_LEVEL?.trim().toLowerCase() !== "verbose") return async () => {};
  return (message) => appendLog(cwd, hook, message);
}

// --- Claude Code's transcript ---

export type TranscriptEntry = { type?: string; version?: string; message?: { model?: string } };

/** Reads a session transcript, one JSON object per line. Empty when there's no file yet. */
export async function readTranscript(path: string | undefined): Promise<TranscriptEntry[]> {
  if (!path || !(await Bun.file(path).exists())) return [];
  const entries: TranscriptEntry[] = [];
  for (const line of (await Bun.file(path).text()).split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // A partly written last line.
    }
  }
  return entries;
}

/** The models that answered in the session, in order of first use. */
export function modelsOf(entries: TranscriptEntry[]): string[] {
  const models = entries
    .filter((entry) => entry.type === "assistant")
    .map((entry) => entry.message?.model)
    .filter((model): model is string => !!model && model !== "<synthetic>");
  return [...new Set(models)];
}

/** The harness version from the transcript, for when the environment doesn't have it. */
export function versionOf(entries: TranscriptEntry[]): string | null {
  return entries.findLast((entry) => entry.version)?.version ?? null;
}
