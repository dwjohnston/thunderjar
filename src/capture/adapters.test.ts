/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: c5299d71-1f4b-4472-9950-df42605e10cc
 *
 * Humans: add your notes here
 */

import { $ } from "bun";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ADAPTERS } from "./adapters.ts";
import { runHook } from "./capture.ts";
import { git } from "./git.ts";

// A payload of each harness's hook, for each event, as it passes it on stdin.
const PAYLOADS = {
  "claude-code": {
    prompt: { session_id: "c1", transcript_path: "/t.jsonl", cwd: "/r", permission_mode: "auto", hook_event_name: "UserPromptSubmit", prompt: "hi" },
    stop: { session_id: "c1", transcript_path: "/t.jsonl", cwd: "/r", permission_mode: "auto", hook_event_name: "Stop", effort: { level: "max" }, last_assistant_message: "Done." },
  },
  codex: {
    prompt: { session_id: "x1", turn_id: "t1", transcript_path: "/c.jsonl", cwd: "/r", hook_event_name: "UserPromptSubmit", model: "gpt-5.5", permission_mode: "default", prompt: "hi" },
    stop: { session_id: "x1", turn_id: "t1", transcript_path: "/c.jsonl", cwd: "/r", hook_event_name: "Stop", model: "gpt-5.5", permission_mode: "default", last_assistant_message: "Done." },
  },
  copilot: {
    prompt: { session_id: "p1", cwd: "/r", hook_event_name: "UserPromptSubmit", prompt: "hi" },
    stop: { session_id: "p1", cwd: "/r", hook_event_name: "Stop", transcript_path: "/p.jsonl" },
  },
  opencode: {
    prompt: { session_id: "ses_1", cwd: "/r", prompt: "hi", model: "opencode/claude-haiku-5-5" },
    stop: { session_id: "ses_1", cwd: "/r", model: "opencode/claude-haiku-5-5" },
  },
};

const CLAUDE_ENV = { CLAUDECODE: "1", AI_AGENT: "claude-code_2-1-322_harness", CLAUDE_CODE_ENTRYPOINT: "cli", CLAUDE_EFFORT: "high" };

describe("adapters", () => {
  test("claude-code: version, surface and effort from the environment; the payload's effort wins", () => {
    expect(ADAPTERS["claude-code"].toEvent(PAYLOADS["claude-code"].prompt, CLAUDE_ENV)).toEqual({
      harness: "claude-code",
      sessionId: "c1",
      cwd: "/r",
      prompt: "hi",
      transcriptPath: "/t.jsonl",
      permissionMode: "auto",
      harnessVersion: "2.1.322",
      harnessSurface: "cli",
      effort: "high",
    });
    expect(ADAPTERS["claude-code"].toEvent(PAYLOADS["claude-code"].stop, CLAUDE_ENV)).toMatchObject({ effort: "max", lastAssistantMessage: "Done." });
  });

  test("codex: the model and turn ID", () => {
    expect(ADAPTERS.codex.toEvent(PAYLOADS.codex.prompt, {})).toEqual({
      harness: "codex",
      sessionId: "x1",
      cwd: "/r",
      prompt: "hi",
      transcriptPath: "/c.jsonl",
      permissionMode: "default",
      model: "gpt-5.5",
      turnId: "t1",
    });
    expect(ADAPTERS.codex.toEvent(PAYLOADS.codex.stop, {})).toMatchObject({ lastAssistantMessage: "Done.", turnId: "t1" });
  });

  test("copilot: no model, and the transcript path from Stop", () => {
    expect(ADAPTERS.copilot.toEvent(PAYLOADS.copilot.prompt, {})).toEqual({ harness: "copilot", sessionId: "p1", cwd: "/r", prompt: "hi" });
    expect(ADAPTERS.copilot.toEvent(PAYLOADS.copilot.stop, {})).toEqual({ harness: "copilot", sessionId: "p1", cwd: "/r", transcriptPath: "/p.jsonl" });
  });

  test("opencode: the model the plugin passes", () => {
    expect(ADAPTERS.opencode.toEvent(PAYLOADS.opencode.prompt, {})).toEqual({
      harness: "opencode",
      sessionId: "ses_1",
      cwd: "/r",
      prompt: "hi",
      model: "opencode/claude-haiku-5-5",
    });
  });

  test("a payload without a session ID is refused", () => {
    expect(() => ADAPTERS.codex.toEvent({ cwd: "/r" }, {})).toThrow("no session_id");
  });

  test("claude-code runs only under Claude Code", () => {
    expect(ADAPTERS["claude-code"].runningUnder({ CLAUDECODE: "1" })).toBe(true);
    expect(ADAPTERS["claude-code"].runningUnder({})).toBe(false);
  });
});

describe("the harness guard", () => {
  let repo: string;
  beforeEach(async () => {
    repo = `${Bun.env.TMPDIR ?? "/tmp"}/tj-adapters-test-${crypto.randomUUID()}`;
    await $`mkdir -p ${repo} && git init -q -b main ${repo}`.quiet();
  });
  afterEach(async () => {
    await $`rm -rf ${repo}`.quiet();
  });

  const input = (session: string) => JSON.stringify({ ...PAYLOADS["claude-code"].prompt, session_id: session, cwd: repo });

  test("Claude Code's hooks, run by Copilot CLI, capture nothing", async () => {
    await runHook("prompt", "claude-code", input("from-copilot"), { COPILOT_CLI_ENABLED_FEATURE_FLAGS: "x" });
    expect(git(repo, ["for-each-ref", "refs/thunderjar"])).toBe("");
  });

  test("run by Claude Code, they capture", async () => {
    await runHook("prompt", "claude-code", input("from-claude"), { CLAUDECODE: "1" });
    expect(git(repo, ["for-each-ref", "--format=%(refname)", "refs/thunderjar"])).toBe("refs/thunderjar/capture/from-claude/start");
  });
});
