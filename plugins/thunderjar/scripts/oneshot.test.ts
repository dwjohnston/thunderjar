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
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { git, harnessFromEnv, parseOneshotPrompt, readTag, tagExists, tagName, type TranscriptEntry } from "./lib.ts";
import { main as start, type PromptInput } from "./start.ts";
import { main as stop, type StopInput } from "./stop.ts";

const SESSION = "11111111-2222-3333-4444-555555555555";
const TASK = 'fix the "quoted" thing & <b>tags</b>\nsecond line';
const ENV = { AI_AGENT: "claude-code_2-1-322_harness", CLAUDE_CODE_ENTRYPOINT: "sdk-cli", CLAUDE_EFFORT: "high" };

let dir: string;
let repo: string;
let transcript: string;

function assistant(model: string): TranscriptEntry {
  return { type: "assistant", version: "2.1.322", message: { model } };
}

function promptInput(prompt = `/tj-oneshot ${TASK}`): PromptInput {
  return { session_id: SESSION, transcript_path: transcript, cwd: repo, permission_mode: "auto", prompt };
}

function stopInput(): StopInput {
  return {
    session_id: SESSION,
    transcript_path: transcript,
    cwd: repo,
    permission_mode: "auto",
    effort: { level: "high" },
    last_assistant_message: "Done.",
  };
}

beforeEach(async () => {
  dir = `${Bun.env.TMPDIR ?? "/tmp"}/tj-oneshot-test-${crypto.randomUUID()}`;
  repo = `${dir}/repo`;
  transcript = `${dir}/transcript.jsonl`;
  await $`mkdir -p ${repo}`.quiet();
  await $`git init -q -b main && git config user.email test@example.com && git config user.name Test && git commit -q --allow-empty -m init`
    .cwd(repo)
    .quiet();
  await Bun.write(transcript, JSON.stringify(assistant("claude-opus-5-5")) + "\n");
});

afterEach(async () => {
  await $`rm -rf ${dir}`.quiet();
});

describe("parseOneshotPrompt", () => {
  test("returns the task verbatim", () => {
    expect(parseOneshotPrompt(`/tj-oneshot ${TASK}`)).toBe(TASK);
  });

  test("accepts the plugin's namespace", () => {
    expect(parseOneshotPrompt("/thunderjar:tj-oneshot x")).toBe("x");
  });

  test("ignores other prompts", () => {
    expect(parseOneshotPrompt("/tj-oneshotter x")).toBeNull();
    expect(parseOneshotPrompt("please run /tj-oneshot x")).toBeNull();
  });
});

describe("harnessFromEnv", () => {
  test("reads the version, surface and effort", () => {
    expect(harnessFromEnv(ENV)).toEqual({ harnessVersion: "2.1.322", harnessSurface: "sdk-cli", effort: "high" });
  });

  test("is null for what's missing", () => {
    expect(harnessFromEnv({})).toEqual({ harnessVersion: null, harnessSurface: null, effort: null });
  });
});

describe("start", () => {
  test("does nothing for other prompts", async () => {
    const head = git(repo, ["rev-parse", "HEAD"]);
    expect(await start(promptInput("just a normal prompt"), ENV)).toEqual({ started: false });
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(head);
  });

  test("makes an empty commit on a clean tree, and tags it with the record", async () => {
    const headBefore = git(repo, ["rev-parse", "HEAD"]);
    const result = await start(promptInput(), ENV);
    if (!result.started) throw new Error("not started");
    const { tag, commit } = result;

    expect(tag).toBe(tagName(SESSION, "start"));
    expect(git(repo, ["rev-parse", `${tag}^{commit}`])).toBe(commit);
    expect(git(repo, ["log", "-1", "--format=%s"])).toBe(`🎯 tj-oneshot start: ${SESSION}`);
    expect(git(repo, ["diff", "--name-only", headBefore, commit])).toBe("");

    expect(readTag(repo, tag)).toMatchObject({
      kind: "start",
      prompt: { text: TASK, typed: `/tj-oneshot ${TASK}`, verbatim: true },
      agent: {
        harness: "Claude Code",
        harnessVersion: "2.1.322",
        harnessSurface: "sdk-cli",
        model: "claude-opus-5-5",
        effort: "high",
        sessionId: SESSION,
        permissionMode: "auto",
      },
      repository: { branch: "main", headBeforeStart: headBefore, startCommit: commit },
    });
  });

  test("commits uncommitted and untracked files, so the agent starts on a clean tree", async () => {
    await Bun.write(`${repo}/new.txt`, "new");
    await start(promptInput(), ENV);

    expect(git(repo, ["show", "--name-only", "--format=", "HEAD"])).toBe("new.txt");
    expect(git(repo, ["status", "--porcelain"])).toBe("");
  });

  test("fails without a task", async () => {
    await expect(start(promptInput("/tj-oneshot   "), ENV)).rejects.toThrow("Give the task");
  });

  test("fails outside a git repository", async () => {
    await expect(start({ ...promptInput(), cwd: dir }, ENV)).rejects.toThrow("isn't in a git repository");
  });

  test("fails when the session already has a one-shot", async () => {
    await start(promptInput(), ENV);
    await expect(start(promptInput(), ENV)).rejects.toThrow("already has a one-shot");
  });
});

describe("stop", () => {
  test("does nothing without a start tag", async () => {
    const head = git(repo, ["rev-parse", "HEAD"]);
    expect(await stop(stopInput(), ENV, { push: false })).toEqual({ recorded: false });
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(head);
  });

  test("commits what the agent left behind, and records its own commits", async () => {
    const started = await start(promptInput(), ENV);
    if (!started.started) throw new Error("not started");
    await Bun.write(`${repo}/committed.txt`, "a");
    await $`git add -A && git commit -q -m "Agent commit"`.cwd(repo).quiet();
    await Bun.write(`${repo}/left.txt`, "b");

    await stop(stopInput(), ENV, { push: false });

    const endTag = tagName(SESSION, "end");
    expect(git(repo, ["log", "-1", "--format=%s"])).toBe(`🏁 tj-oneshot end: ${SESSION}`);
    expect(git(repo, ["status", "--porcelain"])).toBe("");
    expect(git(repo, ["diff", "--name-only", tagName(SESSION, "start"), endTag]).split("\n")).toEqual([
      "committed.txt",
      "left.txt",
    ]);

    const record = readTag(repo, endTag) as { repository: { agentCommits: string[] } };
    expect(record).toMatchObject({
      kind: "end",
      agent: { models: ["claude-opus-5-5"], effort: "high", permissionMode: "auto", harnessVersion: "2.1.322" },
      repository: { startCommit: started.commit, leftUncommitted: ["left.txt"] },
      lastAssistantMessage: "Done.",
    });
    expect(record.repository.agentCommits).toHaveLength(1);
    expect(record.repository.agentCommits[0]).toEndWith(" Agent commit");
  });

  test("makes an empty end commit when the agent committed everything", async () => {
    await start(promptInput(), ENV);
    await stop(stopInput(), ENV, { push: false });

    expect(readTag(repo, tagName(SESSION, "end"))).toMatchObject({ repository: { leftUncommitted: [] } });
  });

  test("records only the first stop", async () => {
    await start(promptInput(), ENV);
    await stop(stopInput(), ENV, { push: false });
    const head = git(repo, ["rev-parse", "HEAD"]);

    await Bun.write(`${repo}/later.txt`, "later");
    expect(await stop(stopInput(), ENV, { push: false })).toEqual({ recorded: false });

    expect(git(repo, ["rev-parse", "HEAD"])).toBe(head);
    expect(git(repo, ["status", "--porcelain"])).toBe("?? later.txt");
  });

  test("pushes both tags to origin, without the branch", async () => {
    const remote = `${dir}/origin.git`;
    await $`git init -q --bare ${remote} && git remote add origin ${remote}`.cwd(repo).quiet();
    await start(promptInput(), ENV);

    expect(await stop(stopInput(), ENV, { push: true })).toEqual({ recorded: true, pushed: true });

    expect(tagExists(remote, tagName(SESSION, "start"))).toBe(true);
    expect(tagExists(remote, tagName(SESSION, "end"))).toBe(true);
    expect(git(remote, ["branch", "--list"])).toBe("");
  });

  test("says how to push the tags when the push fails", async () => {
    await $`git remote add origin ${dir}/missing.git`.cwd(repo).quiet();
    await start(promptInput(), ENV);

    await expect(stop(stopInput(), ENV, { push: true })).rejects.toThrow("Push them with:");
    expect(tagExists(repo, tagName(SESSION, "end"))).toBe(true);
  });

  test("skips the push when there's no origin", async () => {
    await start(promptInput(), ENV);
    expect(await stop(stopInput(), ENV, { push: true })).toMatchObject({ recorded: true, pushed: false });
  });
});
