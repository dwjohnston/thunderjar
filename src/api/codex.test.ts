// Codex's transcript parser, against the rollouts of a real session.
import { describe, expect, test } from "bun:test";
import { transcriptFiles } from "../testing/transcripts.ts";
import { codexTranscript } from "./codex.ts";

describe("codexTranscript", () => {
  // Codex 0.166.0, on DeepSeek's Responses API: asked to run a command, start a sub-agent that runs
  // `ls`, and reply DONE, then, with `codex exec resume --last`, to run `cat one.txt`.
  const SAVED = "codex-0.166.0";

  test("reads the session's messages and tool calls, its sub-agent's among them, in the order they happened", async () => {
    const files = await transcriptFiles(SAVED, codexTranscript.files);
    // The main thread's rollout, and the sub-agent's.
    expect(files.map(({ path }) => path)).toEqual([
      "/home/node/.codex/sessions/2026/11/21/rollout-2026-11-21T04-21-18-01a1fc56-5273-7da0-ac64-e0f99582a8d1.jsonl",
      "/home/node/.codex/sessions/2026/11/21/rollout-2026-11-21T04-21-22-01a1fc56-6323-7191-8da8-dc11b516089b.jsonl",
    ]);

    const events = codexTranscript.parse(files);

    const shell = (cmd: string, yieldTimeMs = 1000, maxOutputTokens = 1000) => ({ cmd, workdir: "/workspace", yield_time_ms: yieldTimeMs, max_output_tokens: maxOutputTokens });
    expect(events).toEqual([
      {
        kind: "message",
        role: "user",
        text: "First, run the shell command `echo one > one.txt` with your shell tool. Then start a sub-agent (with your task / sub-agent tool) whose job is to run `ls` in the shell and report the files it sees. Finally reply with the single word DONE.",
        agent: "main",
      },
      { kind: "toolCall", tool: "exec_command", input: shell("echo one > one.txt"), agent: "main" },
      { kind: "toolCall", tool: "spawn_agent", input: { message: "Run `ls` in the shell from `/workspace` and report the files you see in your final response." }, agent: "main" },
      { kind: "message", role: "user", text: "Run `ls` in the shell from `/workspace` and report the files you see in your final response.", agent: "subagent" },
      { kind: "toolCall", tool: "wait_agent", input: { targets: ["01a1fc56-6323-7191-8da8-dc11b516089b"], timeout_ms: 3600000 }, agent: "main" },
      { kind: "message", role: "assistant", text: "I’ll list the contents of `/workspace` and report them directly.", agent: "subagent" },
      { kind: "toolCall", tool: "exec_command", input: shell("ls", 10000, 20000), agent: "subagent" },
      { kind: "message", role: "assistant", text: "Running `ls` in `/workspace` shows one file:\n\n- `one.txt`", agent: "subagent" },
      { kind: "message", role: "assistant", text: "DONE", agent: "main" },
      // The second turn, resuming the session.
      { kind: "message", role: "user", text: "Now run `cat one.txt` in the shell and reply with what it printed.", agent: "main" },
      { kind: "toolCall", tool: "exec_command", input: shell("cat one.txt"), agent: "main" },
      { kind: "message", role: "assistant", text: "one", agent: "main" },
    ]);
  });
});
