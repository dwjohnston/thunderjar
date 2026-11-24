/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiFAvaM4X8UPgmvECj
 *
 * Humans: add your notes here
 */

import { $ } from "bun";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ADAPTERS } from "./adapters.ts";
import { appendBranchRecord, branchName, importBranches, readBranch } from "./branch.ts";
import { capturePrompt, captureStop, runHook } from "./capture.ts";
import { logDir, pendingPath } from "./files.ts";
import { git, readRecord, refExists, refName } from "./git.ts";
import { listCaptures } from "./list.ts";
import { localStores, push, pushArgs, REFSPECS } from "./push.ts";
import type { StartRecord, TurnRecord } from "./records.ts";
import { configuredStore } from "./store.ts";

const SESSION = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const BASE_ENV = { CLAUDECODE: "1" };
const BRANCH_ENV = { ...BASE_ENV, THUNDERJAR_CAPTURE_STORE: "branch" };
const REFS_ENV = { ...BASE_ENV, THUNDERJAR_CAPTURE_STORE: "refs" };

let dir: string;
let repo: string;

const event = (extra: Record<string, unknown>, session = SESSION) =>
  ADAPTERS["claude-code"].toEvent({ session_id: session, cwd: repo, permission_mode: "auto", ...extra }, BASE_ENV);

/** One whole session: its first prompt, then `turns` turns, each committing a file. */
async function session(env: Record<string, string>, turns: number, id = SESSION) {
  await capturePrompt(event({ prompt: `first prompt of ${id}` }, id), env);
  for (let turn = 1; turn <= turns; turn++) {
    if (turn > 1) await capturePrompt(event({ prompt: `prompt ${turn}` }, id), env);
    await commitFile(`${id}-${turn}.txt`, String(turn), `Turn ${turn}`);
    await captureStop(event({ last_assistant_message: `done ${turn}` }, id), env);
  }
}

async function commitFile(name: string, content: string, message: string) {
  await Bun.write(`${repo}/${name}`, content);
  await $`git add ${name} && git commit -q -m ${message}`.cwd(repo).quiet();
}

const lines = (output: string) => output.split("\n").filter(Boolean);

beforeEach(async () => {
  dir = `${Bun.env.TMPDIR ?? "/tmp"}/tj-capture-branch-test-${crypto.randomUUID()}`;
  repo = `${dir}/repo`;
  await $`mkdir -p ${repo}`.quiet();
  await $`git init -q -b main && git config user.email test@example.com && git config user.name Test`.cwd(repo).quiet();
  await commitFile("README.md", "hello\n", "init");
});

// A git process from the test can still be writing into `dir` when this runs, so `rm` reports
// "Directory not empty" (issue #234). Retry once, then leave the temp folder rather than fail.
afterEach(async () => {
  if ((await $`rm -rf ${dir}`.quiet().nothrow()).exitCode === 0) return;
  await Bun.sleep(100);
  await $`rm -rf ${dir}`.quiet().nothrow();
});

describe("configuredStore", () => {
  test("is refs by default, and branch in a Claude Code cloud session", () => {
    expect(configuredStore({})).toBe("refs");
    expect(configuredStore({ CLAUDE_CODE_REMOTE: "false" })).toBe("refs");
    expect(configuredStore({ CLAUDE_CODE_REMOTE: "true" })).toBe("branch");
  });

  test("THUNDERJAR_CAPTURE_STORE wins either way", () => {
    expect(configuredStore({ THUNDERJAR_CAPTURE_STORE: "branch" })).toBe("branch");
    expect(configuredStore({ THUNDERJAR_CAPTURE_STORE: " Refs ", CLAUDE_CODE_REMOTE: "true" })).toBe("refs");
    expect(configuredStore({ THUNDERJAR_CAPTURE_STORE: "", CLAUDE_CODE_REMOTE: "true" })).toBe("branch");
  });

  test("throws for anything else", () => {
    expect(() => configuredStore({ THUNDERJAR_CAPTURE_STORE: "tags" })).toThrow(/THUNDERJAR_CAPTURE_STORE is "tags": use refs or branch/);
  });
});

describe("the branch store", () => {
  test("start and 3 turns make a 4-commit chain, each holding its record and snapshot", async () => {
    const before = { head: git(repo, ["rev-parse", "HEAD"]), status: git(repo, ["status", "--porcelain"]), index: git(repo, ["ls-files", "--stage"]) };
    const start = await capturePrompt(event({ prompt: "first" }), BRANCH_ENV);
    expect(start).toMatchObject({ captured: "start", ref: branchName(SESSION) });
    const tips = [git(repo, ["rev-parse", branchName(SESSION)])];
    for (let turn = 1; turn <= 3; turn++) {
      if (turn > 1) expect(await capturePrompt(event({ prompt: `prompt ${turn}` }), BRANCH_ENV)).toEqual({ captured: "pending" });
      await commitFile(`file-${turn}.txt`, String(turn), `Turn ${turn}`);
      await Bun.write(`${repo}/uncommitted.txt`, `left in turn ${turn}`);
      const stop = await captureStop(event({}), BRANCH_ENV);
      if (!stop.captured) throw new Error("not captured");
      expect(stop.record.turn).toBe(turn);
      tips.push(git(repo, ["rev-parse", branchName(SESSION)]));
      // Fast-forward only: the old tip is the new tip's parent.
      expect(git(repo, ["rev-parse", `${tips[turn]}^`])).toBe(tips[turn - 1]!);
    }

    expect(git(repo, ["for-each-ref", "refs/thunderjar"])).toBe("");
    expect(lines(git(repo, ["rev-list", branchName(SESSION)]))).toEqual([...tips].reverse());
    expect(git(repo, ["rev-list", "--max-parents=0", branchName(SESSION)])).toBe(tips[0]!);

    const entries = readBranch(repo, SESSION);
    expect(entries.map((entry) => entry.kind)).toEqual(["start", "turn-1", "turn-2", "turn-3"]);
    expect(entries.map((entry) => entry.commit)).toEqual(tips);
    expect(git(repo, ["log", "-1", "--format=%s", tips[2]!])).toBe(`thunderjar capture: ${SESSION} turn-2`);
    expect(git(repo, ["log", "-1", "--format=%an <%ae>", tips[0]!])).toBe("Thunderjar capture <capture@thunderjar.invalid>");

    expect(entries[0]!.record).toMatchObject({ kind: "start", prompt: "first", repository: { headAtStart: before.head, dirty: false } });
    expect(entries[0]!.tree).toBe(git(repo, ["rev-parse", `${before.head}^{tree}`]));
    const turns = entries.slice(1).map((entry) => entry.record as TurnRecord);
    expect(turns.map((turn) => [turn.turn, turn.prompt])).toEqual([
      [1, null],
      [2, "prompt 2"],
      [3, "prompt 3"],
    ]);
    for (const [index, turn] of turns.entries()) {
      expect(turn.repository.agentCommits).toHaveLength(1);
      expect(turn.repository.leftUncommitted).toEqual(["uncommitted.txt"]);
      expect(git(repo, ["show", `${tips[index + 1]}:uncommitted.txt`])).toBe(`left in turn ${index + 1}`);
      expect(git(repo, ["show", `${tips[index + 1]}:file-${index + 1}.txt`])).toBe(String(index + 1));
    }
    expect(await Bun.file(pendingPath(repo, SESSION)).exists()).toBe(false);

    // The user's branch, index and HEAD are left alone.
    expect(git(repo, ["branch", "--show-current"])).toBe("main");
    expect(git(repo, ["ls-files", "--stage"]).split("\n").filter((line) => !line.includes("file-"))).toEqual(before.index.split("\n"));
    expect(git(repo, ["status", "--porcelain"])).toBe("?? uncommitted.txt");
    expect(before.status).toBe("");
  });

  test("a session stays in the store it started in", async () => {
    await capturePrompt(event({ prompt: "first" }), BRANCH_ENV);
    await captureStop(event({}), REFS_ENV);
    expect(readBranch(repo, SESSION).map((entry) => entry.kind)).toEqual(["start", "turn-1"]);
    expect(git(repo, ["for-each-ref", "refs/thunderjar"])).toBe("");
  });

  test("never overwrites: a second start on the same branch fails", async () => {
    await capturePrompt(event({ prompt: "first" }), BRANCH_ENV);
    const tip = git(repo, ["rev-parse", branchName(SESSION)]);
    const tree = git(repo, ["rev-parse", "HEAD^{tree}"]);
    expect(() => appendBranchRecord(repo, SESSION, "start", tree, readBranch(repo, SESSION)[0]!.record)).toThrow();
    expect(git(repo, ["rev-parse", branchName(SESSION)])).toBe(tip);
  });

  test("an invalid THUNDERJAR_CAPTURE_STORE writes nothing, and the hook logs it without throwing", async () => {
    const env = { ...BASE_ENV, THUNDERJAR_CAPTURE_STORE: "nope" };
    await expect(capturePrompt(event({ prompt: "x" }), env)).rejects.toThrow(/THUNDERJAR_CAPTURE_STORE/);
    await runHook("prompt", "claude-code", JSON.stringify({ session_id: SESSION, cwd: repo, prompt: "x" }), env);
    expect(git(repo, ["for-each-ref", "refs/thunderjar", "refs/heads/thunderjar/capture"])).toBe("");
    expect(await Bun.file(`${logDir(repo)}/capture.log`).text()).toContain('THUNDERJAR_CAPTURE_STORE is "nope"');
  });
});

describe("list", () => {
  test("reads both stores, and merges a session that is in both", async () => {
    await session(REFS_ENV, 1, "in-refs");
    await session(BRANCH_ENV, 2, "on-branch");
    const captures = listCaptures(repo);
    expect(captures.map((capture) => [capture.session, capture.verdict, capture.turns, capture.stores])).toEqual([
      ["in-refs", "one-shot", 1, ["refs"]],
      ["on-branch", "few-shot", 2, ["branch"]],
    ]);
    const onBranch = captures[1]!;
    expect(onBranch.prompt).toBe("first prompt of on-branch");
    expect(onBranch.lastTree).toBe(readBranch(repo, "on-branch")[2]!.tree);

    importBranches(repo);
    const merged = listCaptures(repo);
    expect(merged.map((capture) => [capture.session, capture.turns, capture.stores])).toEqual([
      ["in-refs", 1, ["refs"]],
      ["on-branch", 2, ["refs", "branch"]],
    ]);
    expect(merged[1]!.turnRecords).toEqual(onBranch.turnRecords);
    expect(merged[1]!.lastTree).toBe(onBranch.lastTree);
  });
});

describe("push", () => {
  test("names the refspecs of the stores that have captures, and fetches both", async () => {
    expect(REFSPECS).toEqual({
      refs: "refs/thunderjar/capture/*:refs/thunderjar/capture/*",
      branch: "refs/heads/thunderjar/capture/*:refs/heads/thunderjar/capture/*",
    });
    expect(pushArgs({ fetch: false, remote: "origin" }, [])).toBeNull();
    expect(pushArgs({ fetch: false, remote: "origin" }, ["branch"])).toEqual(["push", "--no-verify", "origin", REFSPECS.branch]);
    expect(pushArgs({ fetch: false, remote: "o" }, ["refs", "branch"])).toEqual(["push", "--no-verify", "o", REFSPECS.refs, REFSPECS.branch]);
    expect(pushArgs({ fetch: true, remote: "o" }, [])).toEqual(["fetch", "o", REFSPECS.refs, REFSPECS.branch]);

    expect(localStores(repo)).toEqual([]);
    await session(BRANCH_ENV, 1, "b");
    expect(localStores(repo)).toEqual(["branch"]);
    await session(REFS_ENV, 1, "r");
    expect(localStores(repo)).toEqual(["refs", "branch"]);
  });

  test("pushes only a branch store to a remote, then a later turn fast-forwards, and a clone fetches it", async () => {
    const remote = `${dir}/origin.git`;
    await $`git init -q --bare ${remote} && git remote add origin ${remote}`.cwd(repo).quiet();
    expect(push(repo, { fetch: false, remote: "origin" })).toBeNull();

    await session(BRANCH_ENV, 1);
    push(repo, { fetch: false, remote: "origin" });
    expect(lines(git(remote, ["for-each-ref", "--format=%(refname)"]))).toEqual([branchName(SESSION)]);

    await capturePrompt(event({ prompt: "again" }), BRANCH_ENV);
    await captureStop(event({}), BRANCH_ENV);
    push(repo, { fetch: false, remote: "origin" });
    expect(git(remote, ["rev-parse", branchName(SESSION)])).toBe(git(repo, ["rev-parse", branchName(SESSION)]));

    const clone = `${dir}/clone`;
    await $`git init -q ${clone} && git -C ${clone} remote add origin ${remote}`.quiet();
    push(clone, { fetch: true, remote: "origin" });
    expect(listCaptures(clone).map((capture) => [capture.session, capture.turns])).toEqual([[SESSION, 2]]);
    push(clone, { fetch: true, remote: "origin" });
  });
});

describe("importBranches", () => {
  test("copies each record into refs/thunderjar/capture, once, and leaves the branch", async () => {
    await session(BRANCH_ENV, 2);
    const tip = git(repo, ["rev-parse", branchName(SESSION)]);
    const entries = readBranch(repo, SESSION);

    const first = importBranches(repo);
    const refs = ["start", "turn-1", "turn-2"].map((kind) => refName(SESSION, kind as "start"));
    expect(first).toEqual({ imported: refs, skipped: [] });
    for (const [index, ref] of refs.entries()) {
      expect(git(repo, ["cat-file", "-t", ref])).toBe("tag");
      expect(readRecord(repo, ref)).toEqual(entries[index]!.record);
      expect(git(repo, ["rev-parse", `${ref}^{tree}`])).toBe(entries[index]!.tree);
    }
    // As the hooks write it: the snapshot's parent is the HEAD the record names.
    const start = readRecord<StartRecord>(repo, refs[0]!);
    expect(git(repo, ["rev-parse", `${refs[0]}^{commit}^`])).toBe(start.repository.headAtStart!);
    const turn2 = readRecord<TurnRecord>(repo, refs[2]!);
    expect(git(repo, ["rev-parse", `${refs[2]}^{commit}^`])).toBe(turn2.repository.headAtStop!);

    const tags = refs.map((ref) => git(repo, ["rev-parse", ref]));
    expect(importBranches(repo)).toEqual({ imported: [], skipped: refs });
    expect(refs.map((ref) => git(repo, ["rev-parse", ref]))).toEqual(tags);
    expect(git(repo, ["rev-parse", branchName(SESSION)])).toBe(tip);
  });

  test("a record whose HEAD this clone lacks gets a snapshot with no parent", async () => {
    const remote = `${dir}/origin.git`;
    await $`git init -q --bare ${remote} && git remote add origin ${remote}`.cwd(repo).quiet();
    await session(BRANCH_ENV, 1);
    push(repo, { fetch: false, remote: "origin" });
    const clone = `${dir}/clone`;
    await $`git init -q ${clone} && git -C ${clone} remote add origin ${remote}`.quiet();
    push(clone, { fetch: true, remote: "origin" });

    expect(importBranches(clone).imported).toHaveLength(2);
    expect(refExists(clone, refName(SESSION, "turn-1"))).toBe(true);
    expect(git(clone, ["rev-list", "--count", `${refName(SESSION, "turn-1")}^{commit}`])).toBe("1");
  });
});
