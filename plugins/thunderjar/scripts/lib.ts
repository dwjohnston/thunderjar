/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: 2c687305-6347-4bf9-986d-08bb47278936
 *
 * Humans: add your notes here
 */

import { $ } from "bun";
import { appendFileSync, mkdirSync } from "node:fs";

// Shared by the capture hooks and scripts: git calls, ref names, snapshots, records, and harness details.

export const REF_PREFIX = "refs/thunderjar/capture";

/** Capture runs only when `THUNDERJAR_CAPTURE` is `1` or `true`. */
export function captureEnabled(env: Record<string, string | undefined>): boolean {
  const value = env.THUNDERJAR_CAPTURE?.trim().toLowerCase();
  return value === "1" || value === "true";
}

export type LogLevel = "none" | "verbose";

/** `THUNDERJAR_CAPTURE_LOG_LEVEL`: `verbose` logs each step to capture.log. Anything else means `none`. */
export function logLevel(env: Record<string, string | undefined>): LogLevel {
  return env.THUNDERJAR_CAPTURE_LOG_LEVEL?.trim().toLowerCase() === "verbose" ? "verbose" : "none";
}

export type RefKind = "start" | `turn-${number}`;

// Session IDs are UUIDs. Anything else could make an invalid or surprising ref name.
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function refName(sessionId: string, kind: RefKind): string {
  if (!SESSION_ID.test(sessionId) || sessionId.includes("..") || sessionId.endsWith(".lock")) {
    throw new Error(`can't use session ID ${JSON.stringify(sessionId)} in a ref name`);
  }
  return `${REF_PREFIX}/${sessionId}/${kind}`;
}

// --- records ---

export type Agent = {
  harness: "Claude Code";
  harnessVersion: string | null;
  harnessSurface: string | null;
  effort: string | null;
  sessionId: string;
  transcriptPath: string | null;
  permissionMode: string | null;
};

/** The message of the `start` tag. */
export type StartRecord = {
  schemaVersion: 1;
  kind: "start";
  capturedAt: string;
  /** The first prompt of the session, verbatim. */
  prompt: string;
  agent: Agent;
  repository: { root: string; branch: string | null; headAtStart: string | null; dirty: boolean };
};

/** The message of a `turn-<n>` tag. */
export type TurnRecord = {
  schemaVersion: 1;
  kind: "turn";
  capturedAt: string;
  turn: number;
  /** The prompt that started the turn. Null for turn 1, whose prompt is in the start record. */
  prompt: string | null;
  /** Prompts submitted after the turn began, e.g. after the user interrupted the agent. */
  laterPrompts: string[];
  agent: Agent & { models: string[] };
  repository: {
    branch: string | null;
    headAtStop: string | null;
    /** `<hash> <subject>` of each commit since the previous turn, oldest first. */
    agentCommits: string[];
    /** Files that differ between `headAtStop` and the snapshot. */
    leftUncommitted: string[];
    /** Whether `headAtStart`, or the previous turn's head, is no longer an ancestor of `headAtStop`. */
    historyRewritten: boolean;
  };
  lastAssistantMessage: string | null;
};

// --- harness ---

/**
 * Details Claude Code puts in a hook's environment. `AI_AGENT` looks like `claude-code_2-1-322_harness`;
 * it isn't documented, so the transcript is the fallback for the version.
 */
export function harnessFromEnv(env: Record<string, string | undefined>) {
  const version = env.AI_AGENT?.match(/^claude-code_(\d+(?:-\d+)*)_/)?.[1]?.replaceAll("-", ".") ?? null;
  return {
    harnessVersion: version,
    harnessSurface: env.CLAUDE_CODE_ENTRYPOINT || null,
    effort: env.CLAUDE_EFFORT || null,
  };
}

// --- git ---

type GitResult = { exitCode: number; stdout: string; stderr: string };
type GitOptions = { stdin?: string; env?: Record<string, string> };

/**
 * Snapshot commits and tag objects are written by this identity, so capture works where `user.name` isn't
 * set, and a record never claims to be the user's own commit.
 */
const IDENTITY = {
  GIT_AUTHOR_NAME: "Thunderjar capture",
  GIT_AUTHOR_EMAIL: "capture@thunderjar.invalid",
  GIT_COMMITTER_NAME: "Thunderjar capture",
  GIT_COMMITTER_EMAIL: "capture@thunderjar.invalid",
};

function runGit(cwd: string, args: string[], options: GitOptions = {}): GitResult {
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    env: { ...Bun.env, ...options.env },
    stdin: options.stdin === undefined ? "ignore" : new TextEncoder().encode(options.stdin),
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString().trim(),
    stderr: result.stderr.toString().trim(),
  };
}

/** Runs git and returns its output. Throws when git fails. */
export function git(cwd: string, args: string[], options?: GitOptions): string {
  const result = runGit(cwd, args, options);
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed (exit ${result.exitCode}): ${result.stderr}`);
  }
  return result.stdout;
}

/** Runs git and returns its output, or null when git fails, e.g. `rev-parse HEAD` in an empty repo. */
export function tryGit(cwd: string, args: string[]): string | null {
  const result = runGit(cwd, args);
  return result.exitCode === 0 ? result.stdout : null;
}

/** Whether git exits 0, e.g. for `merge-base --is-ancestor`. */
export function gitSucceeds(cwd: string, args: string[]): boolean {
  return runGit(cwd, args).exitCode === 0;
}

export function refExists(cwd: string, ref: string): boolean {
  return gitSucceeds(cwd, ["show-ref", "--verify", "--quiet", ref]);
}

/** The repository's shared git directory, absolute. The same for every worktree. */
export function gitDir(root: string): string {
  return git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
}

/** Where capture keeps its own files, inside the git directory, so they're never committed. */
export function captureDir(root: string): string {
  return `${gitDir(root)}/thunderjar`;
}

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/**
 * Commits everything in the working tree, tracked or not, as a commit on no branch. Leaves the branch, the
 * index and the working tree as they are.
 *
 * It stages into a copy of the index: git reuses the copy's cached file details, so `add -A` stays fast on a
 * large repository. `dirty` says whether the tree differs from the parent's, or from an empty tree without one.
 */
export async function snapshot(
  root: string,
  parent: string | null,
  message: string,
): Promise<{ commit: string; tree: string; dirty: boolean }> {
  const dir = captureDir(root);
  const index = `${dir}/index-${crypto.randomUUID()}`;
  const realIndex = git(root, ["rev-parse", "--path-format=absolute", "--git-path", "index"]);
  try {
    await $`mkdir -p ${dir}`.quiet();
    if (await Bun.file(realIndex).exists()) await Bun.write(index, Bun.file(realIndex));
    const env = { ...IDENTITY, GIT_INDEX_FILE: index };
    git(root, ["add", "-A"], { env });
    const tree = git(root, ["write-tree"], { env });
    const parentArgs = parent ? ["-p", parent] : [];
    const commit = git(root, ["commit-tree", tree, ...parentArgs], { env, stdin: message });
    const parentTree = parent ? git(root, ["rev-parse", `${parent}^{tree}`]) : EMPTY_TREE;
    return { commit, tree, dirty: tree !== parentTree };
  } finally {
    await Bun.file(index).delete().catch(() => {});
  }
}

/**
 * Points `ref` at a new annotated tag object for `commit`, whose message is `record` as JSON.
 * Refuses to overwrite a ref that already exists.
 */
export function writeRecord(root: string, ref: string, commit: string, record: unknown): string {
  const tagger = git(root, ["var", "GIT_COMMITTER_IDENT"], { env: IDENTITY });
  const tagName = ref.slice("refs/".length);
  const tag = [
    `object ${commit}`,
    "type commit",
    `tag ${tagName}`,
    `tagger ${tagger}`,
    "",
    JSON.stringify(record, null, 2),
    "",
  ].join("\n");
  const object = git(root, ["mktag"], { stdin: tag });
  // An empty old value makes update-ref fail when the ref already exists.
  git(root, ["update-ref", "-m", "thunderjar capture", ref, object, ""]);
  return object;
}

/** Reads the JSON record back out of a ref written by `writeRecord`. */
export function readRecord<T = Record<string, unknown>>(root: string, ref: string): T {
  const tag = git(root, ["cat-file", "tag", ref]);
  return JSON.parse(tag.slice(tag.indexOf("\n\n") + 2)) as T;
}

/** The number of the session's next turn: one more than the highest `turn-<n>` ref. */
export function nextTurn(root: string, sessionId: string): number {
  const prefix = `${refName(sessionId, "start").slice(0, -"start".length)}turn-`;
  const refs = git(root, ["for-each-ref", "--format=%(refname)", `${prefix}*`]).split("\n").filter(Boolean);
  const numbers = refs.map((ref) => Number(ref.slice(prefix.length))).filter(Number.isInteger);
  return Math.max(0, ...numbers) + 1;
}

// --- pending prompts ---

/** Where `start.ts` leaves the prompts of a later turn for `stop.ts`. */
export function pendingPath(root: string, sessionId: string): string {
  return `${captureDir(root)}/${sessionId}/pending.json`;
}

export type Pending = { prompts: { text: string; submittedAt: string }[] };

export async function readPending(root: string, sessionId: string): Promise<Pending> {
  const file = Bun.file(pendingPath(root, sessionId));
  if (!(await file.exists())) return { prompts: [] };
  return (await file.json()) as Pending;
}

/**
 * Adds a prompt to the pending file. A turn can have more than one, e.g. when the user interrupts the agent:
 * Claude Code doesn't run the Stop hook then, so the next prompt joins the same turn.
 */
export async function addPending(root: string, sessionId: string, text: string) {
  const pending = await readPending(root, sessionId);
  pending.prompts.push({ text, submittedAt: new Date().toISOString() });
  await Bun.write(pendingPath(root, sessionId), JSON.stringify(pending, null, 2) + "\n", { createPath: true });
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

function appendLog(cwd: string, hook: string, message: string) {
  try {
    const root = tryGit(cwd, ["rev-parse", "--show-toplevel"]);
    if (!root) return;
    const dir = logDir(root);
    mkdirSync(dir, { recursive: true });
    appendFileSync(`${dir}/capture.log`, `${new Date().toISOString()} ${hook}: ${message}\n`);
  } catch {
    // Nothing more to do: a hook must never fail the session.
  }
}

/**
 * Appends a failure to `.thunderjar/logs/capture.log`. The hooks never fail the session, so this is
 * where their errors go. Outside a git repository there's nowhere to write, and the error is dropped.
 */
export async function logError(cwd: string, hook: string, error: unknown) {
  appendLog(cwd, hook, error instanceof Error ? (error.stack ?? error.message) : String(error));
}

export type Log = (message: string) => void;

/**
 * A logger for one hook run. With `THUNDERJAR_CAPTURE_LOG_LEVEL=verbose` it appends each message to
 * `.thunderjar/logs/capture.log`; otherwise it does nothing. Never stdout: Claude Code would add
 * that to the agent's context.
 */
export function verboseLogger(cwd: string, hook: string, env: Record<string, string | undefined>): Log {
  if (logLevel(env) !== "verbose") return () => {};
  return (message) => appendLog(cwd, hook, message);
}

// --- transcript ---

export type TranscriptEntry = {
  type?: string;
  version?: string;
  message?: { model?: string };
};

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
