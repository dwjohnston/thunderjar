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
// Loads pino before any test runs. files.ts imports it lazily, only for verbose logging, and under
// `bun test --parallel` Bun sometimes faults on that first load (EEXIST from epoll_ctl, in sonic-boom's
// node:assert), failing "logs each step to capture.log with verbose". See issue #234.
import "pino";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ADAPTERS } from "./adapters.ts";
import { captureEnabled, capturePrompt, captureStop } from "./capture.ts";
import { logDir, pendingPath, type TranscriptEntry } from "./files.ts";
import { git, nextTurn, readRecord, refExists, refName, snapshot, writeRecord } from "./git.ts";
import { listCaptures } from "./list.ts";
import { push } from "./push.ts";
import type { StartRecord, TurnRecord } from "./records.ts";

const SESSION = "11111111-2222-3333-4444-555555555555";
const PROMPT = 'fix the "quoted" thing & <b>tags</b>\nsecond line';
const ENV = {
  CLAUDECODE: "1",
  AI_AGENT: "claude-code_2-1-322_harness",
  CLAUDE_CODE_ENTRYPOINT: "sdk-cli",
  CLAUDE_EFFORT: "high",
};

let dir: string;
let repo: string;
let transcript: string;

function assistant(model: string): TranscriptEntry {
  return { type: "assistant", version: "2.1.322", message: { model } };
}

/** Claude Code's UserPromptSubmit input, through its adapter. */
function promptInput(prompt = PROMPT, session = SESSION) {
  return ADAPTERS["claude-code"].toEvent({ session_id: session, transcript_path: transcript, cwd: repo, permission_mode: "auto", prompt }, ENV);
}

/** Claude Code's Stop input, through its adapter. */
function stopInput(session = SESSION) {
  return ADAPTERS["claude-code"].toEvent(
    { session_id: session, transcript_path: transcript, cwd: repo, permission_mode: "auto", effort: { level: "high" }, last_assistant_message: "Done." },
    ENV,
  );
}

const start = capturePrompt;
const stop = captureStop;

/** Everything a capture must leave alone: HEAD, the branch, the index and the status. */
function repoState() {
  return {
    head: git(repo, ["rev-parse", "HEAD"]),
    branch: git(repo, ["branch", "--show-current"]),
    index: git(repo, ["ls-files", "--stage"]),
    status: git(repo, ["status", "--porcelain", "--untracked-files=all"]),
    log: git(repo, ["log", "--branches", "--tags", "--format=%H"]),
  };
}

async function commitFile(name: string, content: string, message: string) {
  await Bun.write(`${repo}/${name}`, content);
  await $`git add -A && git commit -q -m ${message}`.cwd(repo).quiet();
}

beforeEach(async () => {
  dir = `${Bun.env.TMPDIR ?? "/tmp"}/tj-capture-test-${crypto.randomUUID()}`;
  repo = `${dir}/repo`;
  transcript = `${dir}/transcript.jsonl`;
  await $`mkdir -p ${repo}`.quiet();
  await $`git init -q -b main && git config user.email test@example.com && git config user.name Test`.cwd(repo).quiet();
  await commitFile("README.md", "hello\n", "init");
  await Bun.write(transcript, JSON.stringify(assistant("claude-opus-5-5")) + "\n");
});

afterEach(async () => {
  await $`rm -rf ${dir}`.quiet();
});

describe("captureEnabled", () => {
  test("is on unless switched off", () => {
    expect(captureEnabled({})).toBe(true);
    expect(captureEnabled({ THUNDERJAR_CAPTURE: "1" })).toBe(true);
    expect(captureEnabled({ THUNDERJAR_CAPTURE: "" })).toBe(true);
  });

  test("is off for 0 and false", () => {
    expect(captureEnabled({ THUNDERJAR_CAPTURE: "0" })).toBe(false);
    expect(captureEnabled({ THUNDERJAR_CAPTURE: "false" })).toBe(false);
  });
});

describe("verbose logging", () => {
  const logFile = () => Bun.file(`${logDir(repo)}/capture.log`);

  test("is off by default", async () => {
    await start(promptInput(), ENV);
    await stop(stopInput(), ENV);
    expect(await logFile().exists()).toBe(false);
  });

  test("logs each step to capture.log with verbose", async () => {
    const env = { ...ENV, THUNDERJAR_CAPTURE_LOG_LEVEL: "verbose" };
    await start(promptInput(), env);
    await stop(stopInput(), env);
    const log = await logFile().text();
    expect(log).toContain(`prompt: wrote ${refName(SESSION, "start")}`);
    expect(log).toContain(`stop: wrote ${refName(SESSION, "turn-1")}`);
  }, 20_000); // two hook runs, each spawning git: over the 5 s default when the parallel suite loads CI
});

describe("refName", () => {
  test("puts the session under refs/thunderjar/capture", () => {
    expect(refName(SESSION, "start")).toBe(`refs/thunderjar/capture/${SESSION}/start`);
    expect(refName(SESSION, "turn-2")).toBe(`refs/thunderjar/capture/${SESSION}/turn-2`);
  });

  test("refuses session IDs that aren't safe in a ref", () => {
    expect(() => refName("../x", "start")).toThrow();
    expect(() => refName("a b", "start")).toThrow();
  });
});

describe("capture off", () => {
  test("writes nothing", async () => {
    const before = repoState();
    const env = { ...ENV, THUNDERJAR_CAPTURE: "0" };

    expect(await start(promptInput(), env)).toEqual({ captured: "nothing" });
    expect(await stop(stopInput(), env)).toEqual({ captured: false });

    expect(git(repo, ["for-each-ref", "refs/thunderjar"])).toBe("");
    expect(await Bun.file(`${repo}/.git/thunderjar`).exists()).toBe(false);
    expect(repoState()).toEqual(before);
  });
});

describe("start", () => {
  test("does nothing outside a git repository", async () => {
    expect(await start({ ...promptInput(), cwd: dir }, ENV)).toEqual({ captured: "nothing" });
  });

  test("a clean start: not dirty, and the snapshot's tree is HEAD's", async () => {
    const before = repoState();
    const result = await start(promptInput(), ENV);
    if (result.captured !== "start") throw new Error("not captured");

    expect(git(repo, ["rev-parse", `${result.ref}^{tree}`])).toBe(git(repo, ["rev-parse", "HEAD^{tree}"]));
    expect(git(repo, ["rev-parse", `${result.ref}^{commit}^`])).toBe(before.head);
    expect(git(repo, ["cat-file", "-t", result.ref])).toBe("tag");
    expect(readRecord<StartRecord>(repo, result.ref)).toMatchObject({
      kind: "start",
      prompt: PROMPT,
      agent: {
        harness: "claude-code",
        harnessVersion: "2.1.322",
        harnessSurface: "sdk-cli",
        effort: "high",
        sessionId: SESSION,
        transcriptPath: transcript,
        permissionMode: "auto",
      },
      repository: { branch: "main", headAtStart: before.head, dirty: false },
    });
    expect(repoState()).toEqual(before);
  });

  test("a dirty start: the snapshot holds the untracked file, and the repo is unchanged", async () => {
    await Bun.write(`${repo}/new.txt`, "new");
    await Bun.write(`${repo}/README.md`, "changed\n");
    await $`git add README.md`.cwd(repo).quiet();
    const before = repoState();

    const result = await start(promptInput(), ENV);
    if (result.captured !== "start") throw new Error("not captured");

    expect(result.record.repository.dirty).toBe(true);
    expect(git(repo, ["show", `${result.ref}^{commit}:new.txt`])).toBe("new");
    expect(git(repo, ["show", `${result.ref}^{commit}:README.md`])).toBe("changed");
    expect(repoState()).toEqual(before);
  });

  test("leaves ignored files out", async () => {
    await Bun.write(`${repo}/.gitignore`, "secret.txt\n");
    await Bun.write(`${repo}/secret.txt`, "shh");
    const result = await start(promptInput(), ENV);
    if (result.captured !== "start") throw new Error("not captured");

    expect(git(repo, ["ls-tree", "--name-only", result.ref])).not.toContain("secret.txt");
  });

  test("works in a repository with no commits", async () => {
    await $`rm -rf ${repo} && git init -q -b main ${repo}`.quiet();
    await Bun.write(`${repo}/a.txt`, "a");

    const result = await start(promptInput(), ENV);
    if (result.captured !== "start") throw new Error("not captured");

    expect(result.record.repository).toMatchObject({ headAtStart: null, dirty: true });
    expect(git(repo, ["ls-tree", "--name-only", result.ref])).toBe("a.txt");
  });

  test("a later prompt goes to pending.json", async () => {
    await start(promptInput(), ENV);
    expect(await start(promptInput("next"), ENV)).toEqual({ captured: "pending" });
    expect(await Bun.file(pendingPath(repo, SESSION)).json()).toMatchObject({ prompts: [{ text: "next" }] });
  });
});

describe("stop", () => {
  test("does nothing without a start ref", async () => {
    expect(await stop(stopInput(), ENV)).toEqual({ captured: false });
    expect(git(repo, ["for-each-ref", "refs/thunderjar"])).toBe("");
  });

  test("turn 1 with an agent commit: parent is the agent's commit, which is listed", async () => {
    await start(promptInput(), ENV);
    await commitFile("committed.txt", "a", "Agent commit");
    await Bun.write(`${repo}/left.txt`, "b");
    const before = repoState();

    const result = await stop(stopInput(), ENV);
    if (!result.captured) throw new Error("not captured");

    expect(result.ref).toBe(refName(SESSION, "turn-1"));
    expect(git(repo, ["rev-parse", `${result.ref}^{commit}^`])).toBe(before.head);
    expect(git(repo, ["show", `${result.ref}^{commit}:left.txt`])).toBe("b");
    const record = readRecord<TurnRecord>(repo, result.ref);
    expect(record).toMatchObject({
      kind: "turn",
      turn: 1,
      prompt: null,
      laterPrompts: [],
      agent: { harness: "claude-code", model: null, models: ["claude-opus-5-5"], effort: "high", permissionMode: "auto", harnessVersion: "2.1.322" },
      repository: {
        branch: "main",
        headAtStop: before.head,
        agentCommits: [`${before.head} Agent commit`],
        leftUncommitted: ["left.txt"],
        historyRewritten: false,
      },
      lastAssistantMessage: "Done.",
    });
    expect(repoState()).toEqual(before);
  });

  test("turn 2 carries the prompt from pending.json, and the file is gone afterwards", async () => {
    await start(promptInput(), ENV);
    await commitFile("one.txt", "1", "First");
    await stop(stopInput(), ENV);
    await start(promptInput("now do two"), ENV);
    await commitFile("two.txt", "2", "Second");

    const result = await stop(stopInput(), ENV);
    if (!result.captured) throw new Error("not captured");

    expect(result.record).toMatchObject({ turn: 2, prompt: "now do two", laterPrompts: [] });
    expect(result.record.repository.agentCommits).toHaveLength(1);
    expect(result.record.repository.agentCommits[0]).toEndWith(" Second");
    expect(await Bun.file(pendingPath(repo, SESSION)).exists()).toBe(false);
    expect(nextTurn(repo, SESSION)).toBe(3);
  });

  test("a prompt after an interrupt joins the same turn", async () => {
    await start(promptInput(), ENV);
    await start(promptInput("actually, also this"), ENV);

    const result = await stop(stopInput(), ENV);
    if (!result.captured) throw new Error("not captured");

    expect(result.record).toMatchObject({ turn: 1, prompt: null, laterPrompts: ["actually, also this"] });
  });

  test("a rebase between turns sets historyRewritten", async () => {
    await start(promptInput(), ENV);
    await commitFile("one.txt", "1", "First");
    const first = await stop(stopInput(), ENV);
    if (!first.captured) throw new Error("not captured");
    expect(first.record.repository.historyRewritten).toBe(false);

    await start(promptInput("reword it"), ENV);
    await $`git commit -q --amend -m "First, reworded"`.cwd(repo).quiet();
    const second = await stop(stopInput(), ENV);
    if (!second.captured) throw new Error("not captured");

    expect(second.record.repository.historyRewritten).toBe(true);
  });

  test("resetting past the start sets historyRewritten", async () => {
    await commitFile("base.txt", "base", "Base");
    await start(promptInput(), ENV);
    await $`git reset -q --hard HEAD~1`.cwd(repo).quiet();

    const result = await stop(stopInput(), ENV);
    if (!result.captured) throw new Error("not captured");

    expect(result.record.repository.historyRewritten).toBe(true);
  });
});

describe("writeRecord", () => {
  test("never overwrites an existing ref", async () => {
    await start(promptInput(), ENV);
    const ref = refName(SESSION, "start");
    const original = git(repo, ["rev-parse", ref]);
    const { commit } = await snapshot(repo, git(repo, ["rev-parse", "HEAD"]), "other\n");

    expect(() => writeRecord(repo, ref, commit, { other: true })).toThrow();
    expect(git(repo, ["rev-parse", ref])).toBe(original);
  });
});

describe("list", () => {
  async function session(id: string, turns: (() => Promise<void>)[]) {
    await start(promptInput(`prompt of ${id}`, id), ENV);
    for (const [index, work] of turns.entries()) {
      if (index > 0) await start(promptInput(`turn ${index + 1}`, id), ENV);
      await work();
      await stop(stopInput(id), ENV);
    }
  }
  let files = 0;
  const change = async () => commitFile(`file-${++files}.txt`, String(files), `Change ${files}`);
  const nothing = async () => {};

  test("gives each capture its verdict", async () => {
    await session("incomplete", []);
    await session("question", [nothing, nothing]);
    await session("one-shot", [change]);
    await session("few-shot", [change, change, change]);
    await session("conversation", [change, change, change, change]);
    await session("rewritten", [change, async () => void (await $`git commit -q --amend -m reworded`.cwd(repo).quiet())]);

    const verdicts = Object.fromEntries(listCaptures(repo).map((capture) => [capture.session, capture.verdict]));
    expect(verdicts).toEqual({
      incomplete: "incomplete",
      question: "question",
      "one-shot": "one-shot",
      "few-shot": "few-shot",
      conversation: "conversation",
      rewritten: "rewritten",
    });
  });

  test("is empty without captures", () => {
    expect(listCaptures(repo)).toEqual([]);
  });
});

describe("push", () => {
  test("pushes the captures, and fetches them into another clone", async () => {
    const remote = `${dir}/origin.git`;
    await $`git init -q --bare ${remote} && git remote add origin ${remote}`.cwd(repo).quiet();
    await start(promptInput(), ENV);
    await stop(stopInput(), ENV);

    push(repo, { fetch: false, remote: "origin" });
    expect(refExists(remote, refName(SESSION, "turn-1"))).toBe(true);
    expect(git(remote, ["branch", "--list"])).toBe("");

    const clone = `${dir}/clone`;
    await $`git init -q ${clone} && git -C ${clone} remote add origin ${remote}`.quiet();
    push(clone, { fetch: true, remote: "origin" });
    expect(readRecord<StartRecord>(clone, refName(SESSION, "start")).prompt).toBe(PROMPT);

    // Again: nothing moved, so no --force is needed.
    push(repo, { fetch: false, remote: "origin" });
    push(clone, { fetch: true, remote: "origin" });
  });
});
