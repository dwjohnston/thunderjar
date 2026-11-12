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
import { findOneshotPrompt, git, readTag, tagExists, tagName, type TranscriptEntry } from "./lib.ts";
import { main as start } from "./start.ts";
import { main as stop, type StopInput } from "./stop.ts";

const SESSION = "11111111-2222-3333-4444-555555555555";
const PROMPT = 'fix the "quoted" thing & <b>tags</b>\nsecond line';

let dir: string;
let repo: string;
let transcript: string;

function userCommand(args: string, name = "/tj-oneshot"): TranscriptEntry {
  return {
    type: "user",
    version: "2.1.322",
    entrypoint: "sdk-cli",
    permissionMode: "auto",
    message: {
      content: `<command-message>tj-oneshot</command-message>\n<command-name>${name}</command-name>\n<command-args>${args}</command-args>`,
    },
  };
}

function assistant(model: string): TranscriptEntry {
  return { type: "assistant", version: "2.1.322", message: { model, content: [{ type: "text", text: "ok" }] } };
}

async function writeTranscript(entries: TranscriptEntry[]) {
  await Bun.write(transcript, entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
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
  await writeTranscript([userCommand(PROMPT), assistant("claude-opus-5-5")]);
});

afterEach(async () => {
  await $`rm -rf ${dir}`.quiet();
});

describe("findOneshotPrompt", () => {
  test("returns the arguments verbatim", () => {
    expect(findOneshotPrompt([userCommand(PROMPT)])).toBe(PROMPT);
  });

  test("finds a plugin-namespaced command", () => {
    expect(findOneshotPrompt([userCommand("x", "/thunderjar:tj-oneshot")])).toBe("x");
  });

  test("returns the latest invocation", () => {
    expect(findOneshotPrompt([userCommand("first"), userCommand("second")])).toBe("second");
  });

  test("ignores other commands", () => {
    expect(findOneshotPrompt([userCommand("x", "/tj-quick-capture")])).toBeNull();
  });
});

describe("start", () => {
  test("makes an empty commit on a clean tree, and tags it with the record", async () => {
    const headBefore = git(repo, ["rev-parse", "HEAD"]);
    const { tag, commit } = await start({ cwd: repo, sessionId: SESSION, effort: "high", transcriptPath: transcript });

    expect(tag).toBe(tagName(SESSION, "start"));
    expect(git(repo, ["rev-parse", `${tag}^{commit}`])).toBe(commit);
    expect(git(repo, ["log", "-1", "--format=%s"])).toBe(`🎯 tj-oneshot start: ${SESSION}`);
    expect(git(repo, ["diff", "--name-only", headBefore, commit])).toBe("");

    expect(readTag(repo, tag)).toMatchObject({
      kind: "start",
      prompt: { text: PROMPT, verbatim: true },
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
    await start({ cwd: repo, sessionId: SESSION, effort: null, transcriptPath: transcript });

    expect(git(repo, ["show", "--name-only", "--format=", "HEAD"])).toBe("new.txt");
    expect(git(repo, ["status", "--porcelain"])).toBe("");
  });

  test("fails when the prompt isn't in the transcript", async () => {
    await writeTranscript([assistant("claude-opus-5-5")]);
    await expect(start({ cwd: repo, sessionId: SESSION, effort: null, transcriptPath: transcript, waitMs: 0 })).rejects.toThrow(
      "Could not find the /tj-oneshot prompt",
    );
  });

  test("fails when the start is already recorded", async () => {
    await start({ cwd: repo, sessionId: SESSION, effort: null, transcriptPath: transcript });
    await expect(start({ cwd: repo, sessionId: SESSION, effort: null, transcriptPath: transcript })).rejects.toThrow(
      "already recorded",
    );
  });
});

describe("stop", () => {
  test("does nothing without a start tag", async () => {
    const head = git(repo, ["rev-parse", "HEAD"]);
    const result = await stop(stopInput(), { push: false });

    expect(result.recorded).toBe(false);
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(head);
  });

  test("commits what the agent left behind, and records its own commits", async () => {
    const { commit: startCommit } = await start({ cwd: repo, sessionId: SESSION, effort: null, transcriptPath: transcript });
    await Bun.write(`${repo}/committed.txt`, "a");
    await $`git add -A && git commit -q -m "Agent commit"`.cwd(repo).quiet();
    await Bun.write(`${repo}/left.txt`, "b");

    await stop(stopInput(), { push: false });

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
      agent: { models: ["claude-opus-5-5"], effort: "high", permissionMode: "auto", sessionId: SESSION },
      repository: { startCommit, leftUncommitted: ["left.txt"] },
      lastAssistantMessage: "Done.",
    });
    expect(record.repository.agentCommits).toHaveLength(1);
    expect(record.repository.agentCommits[0]).toEndWith(" Agent commit");
  });

  test("makes an empty end commit when the agent committed everything", async () => {
    await start({ cwd: repo, sessionId: SESSION, effort: null, transcriptPath: transcript });
    await stop(stopInput(), { push: false });

    expect(readTag(repo, tagName(SESSION, "end"))).toMatchObject({ repository: { leftUncommitted: [] } });
  });

  test("records the end only once", async () => {
    await start({ cwd: repo, sessionId: SESSION, effort: null, transcriptPath: transcript });
    await stop(stopInput(), { push: false });
    const head = git(repo, ["rev-parse", "HEAD"]);

    await Bun.write(`${repo}/later.txt`, "later");
    await stop(stopInput(), { push: false });

    expect(git(repo, ["rev-parse", "HEAD"])).toBe(head);
    expect(git(repo, ["status", "--porcelain"])).toBe("?? later.txt");
  });

  test("pushes both tags to origin, without the branch", async () => {
    await $`git init -q --bare ${dir}/origin.git && git remote add origin ${dir}/origin.git`.cwd(repo).quiet();
    await start({ cwd: repo, sessionId: SESSION, effort: null, transcriptPath: transcript });

    const result = await stop(stopInput(), { push: true });

    expect(result.pushed).toBe(true);
    const remote = `${dir}/origin.git`;
    expect(tagExists(remote, tagName(SESSION, "start"))).toBe(true);
    expect(tagExists(remote, tagName(SESSION, "end"))).toBe(true);
    expect(git(remote, ["branch", "--list"])).toBe("");
  });

  test("skips the push when there's no origin", async () => {
    await start({ cwd: repo, sessionId: SESSION, effort: null, transcriptPath: transcript });
    const result = await stop(stopInput(), { push: true });

    expect(result).toMatchObject({ recorded: true, pushed: false });
  });
});
