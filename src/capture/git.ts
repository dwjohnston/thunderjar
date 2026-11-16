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

// Capture's git calls: ref names, snapshots of the working tree, and the records kept in tag messages.
// Synchronous, so a hook stays a straight line of steps; each is one short git call.

export const REF_PREFIX = "refs/thunderjar/capture";

export type RefKind = "start" | `turn-${number}`;

// Harness session IDs are UUIDs, or OpenCode's `ses_…`. Anything else could make an invalid or surprising ref name.
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function refName(sessionId: string, kind: RefKind): string {
  if (!SESSION_ID.test(sessionId) || sessionId.includes("..") || sessionId.endsWith(".lock")) {
    throw new Error(`can't use session ID ${JSON.stringify(sessionId)} in a ref name`);
  }
  return `${REF_PREFIX}/${sessionId}/${kind}`;
}

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
  return { exitCode: result.exitCode, stdout: result.stdout.toString().trim(), stderr: result.stderr.toString().trim() };
}

/** Runs git and returns its output. Throws when git fails. */
export function git(cwd: string, args: string[], options?: GitOptions): string {
  const result = runGit(cwd, args, options);
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed (exit ${result.exitCode}): ${result.stderr}`);
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

/** The top of the git repository `cwd` is in, or null outside one. */
export function repoRoot(cwd: string): string | null {
  return tryGit(cwd, ["rev-parse", "--show-toplevel"]);
}

export function refExists(cwd: string, ref: string): boolean {
  return gitSucceeds(cwd, ["show-ref", "--verify", "--quiet", ref]);
}

/** Where capture keeps its own files: inside the shared git directory, so they're never committed. */
export function captureDir(root: string): string {
  return `${git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"])}/thunderjar`;
}

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/**
 * Commits everything in the working tree, tracked or not, as a commit on no branch. Leaves the branch, the
 * index and the working tree as they are.
 *
 * It stages into a copy of the index: git reuses the copy's cached file details, so `add -A` stays fast on a
 * large repository. `dirty` says whether the tree differs from the parent's, or from an empty tree without one.
 */
export async function snapshot(root: string, parent: string | null, message: string): Promise<{ commit: string; tree: string; dirty: boolean }> {
  const dir = captureDir(root);
  const index = `${dir}/index-${crypto.randomUUID()}`;
  const realIndex = git(root, ["rev-parse", "--path-format=absolute", "--git-path", "index"]);
  try {
    await $`mkdir -p ${dir}`.quiet();
    if (await Bun.file(realIndex).exists()) await Bun.write(index, Bun.file(realIndex));
    const env = { ...IDENTITY, GIT_INDEX_FILE: index };
    git(root, ["add", "-A"], { env });
    const tree = git(root, ["write-tree"], { env });
    const commit = git(root, ["commit-tree", tree, ...(parent ? ["-p", parent] : [])], { env, stdin: message });
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
  const tag = [`object ${commit}`, "type commit", `tag ${ref.slice("refs/".length)}`, `tagger ${tagger}`, "", JSON.stringify(record, null, 2), ""].join("\n");
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
  return Math.max(0, ...refs.map((ref) => Number(ref.slice(prefix.length))).filter(Number.isInteger)) + 1;
}
