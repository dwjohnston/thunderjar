/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: session_01LCLeLiw2YB851n82Y1sd8t
 *
 * Humans: add your notes here
 */

// `thunderjar purge capture`, through the CLI, on a temporary git repository with captures in both
// stores, and a bare repository as its remote, `origin`.
import { $ } from "bun";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { git, snapshotTree, treeOf } from "../../../capture/git.ts";
import type { StartRecord, TurnRecord } from "../../../capture/records.ts";
import { type StoreKind, writeRecordIn } from "../../../capture/store.ts";
import { REPO_ROOT } from "../../../testing/scenario.ts";

const CLI = `${REPO_ROOT}/src/cli/index.ts`;
const DAY = 86_400_000;

let dir: string;
let repo: string;
let remote: string;

/** `thunderjar purge capture <args…>` in `cwd`, the repository unless given. */
async function purge(args: string[], cwd = repo) {
  const result = await $`bun ${CLI} purge capture ${args}`.cwd(cwd).env({ ...Bun.env, CLAUDE_CODE_REMOTE: "" }).quiet().nothrow();
  return { stdout: result.stdout.toString(), stderr: result.stderr.toString(), exitCode: result.exitCode };
}

const agent = (session: string) => ({
  harness: "claude-code" as const,
  harnessVersion: null,
  harnessSurface: null,
  effort: null,
  sessionId: session,
  transcriptPath: null,
  permissionMode: null,
});

/** Writes a session's start, `daysAgo` days ago, and a turn per tree in `turns`, into `store`. */
async function capture(store: StoreKind, session: string, prompt: string, daysAgo: number, turns: string[]) {
  const capturedAt = new Date(Date.now() - daysAgo * DAY).toISOString();
  const start: StartRecord = { schemaVersion: 1, kind: "start", capturedAt, prompt, agent: agent(session), repository: { root: repo, branch: "main", headAtStart: null, dirty: false } };
  writeRecordIn(repo, store, session, "start", treeOf(repo, null), null, start);
  turns.forEach((tree, i) => {
    const turn: TurnRecord = {
      schemaVersion: 1,
      kind: "turn",
      capturedAt,
      turn: i + 1,
      prompt: null,
      laterPrompts: [],
      agent: { ...agent(session), model: null, models: [], turnId: null },
      repository: { branch: "main", headAtStop: null, agentCommits: [], leftUncommitted: [], historyRewritten: false },
      lastAssistantMessage: null,
    };
    writeRecordIn(repo, store, session, `turn-${i + 1}`, tree, null, turn);
  });
}

/** The capture refs in `cwd`, or on the remote. */
const localRefs = (cwd = repo) => git(cwd, ["for-each-ref", "--format=%(refname)", "refs/thunderjar/capture/", "refs/heads/thunderjar/capture/"]).split("\n").filter(Boolean);
const remoteRefs = () => localRefs(remote);
const pushAll = () => git(repo, ["push", "-q", "origin", "refs/thunderjar/capture/*:refs/thunderjar/capture/*", "refs/heads/thunderjar/capture/*:refs/heads/thunderjar/capture/*"]);

beforeEach(async () => {
  dir = `${Bun.env.TMPDIR ?? "/tmp"}/tj-purge-capture-test-${crypto.randomUUID()}`;
  repo = `${dir}/repo`;
  remote = `${dir}/remote.git`;
  await $`mkdir -p ${repo} && git init -q -b main ${repo} && git init -q --bare ${remote} && git -C ${repo} remote add origin ${remote}`.quiet();
  await Bun.write(`${repo}/a.txt`, "a");
  const changed = await snapshotTree(repo);
  const empty = treeOf(repo, null);
  // incomplete, in refs, 40 days ago
  await capture("refs", "old-incomplete", "Fix the old bug", 40, []);
  // question, in refs, 2 days ago: its turn's tree is its start's
  await capture("refs", "a-question", "What does this do?", 2, [empty]);
  // one-shot, in the branch store, today
  await capture("branch", "new-one-shot", "Add a --json flag to show\nand more", 0, [changed]);
});

afterEach(async () => {
  await $`rm -rf ${dir}`.quiet();
});

test("--verdict --dry-run lists the sessions it would delete, with verdict, age and prompt, and deletes nothing", async () => {
  const before = localRefs();

  expect(await purge(["--verdict", "incomplete", "--dry-run"])).toEqual({
    stdout: 'old-incomplete  incomplete  40d  "Fix the old bug"\n1 session would be deleted.\n',
    stderr: "",
    exitCode: 0,
  });
  expect(localRefs()).toEqual(before);
});
