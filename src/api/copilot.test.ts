// Copilot's transcript parser, against the events of a real session.
import { describe, expect, test } from "bun:test";
import { transcriptFiles } from "../testing/transcripts.ts";
import { copilotTranscript } from "./copilot.ts";

describe("copilotTranscript", () => {
  // Copilot CLI 1.0.105, in BYOK mode on DeepSeek: asked to run a command, start a sub-agent that
  // runs `ls`, and reply DONE, then, with `copilot --continue`, to run `cat one.txt`.
  const SAVED = "copilot-1.0.105";

  test("reads the session's messages and tool calls, its sub-agent's among them, in the order they happened", async () => {
    const files = await transcriptFiles(SAVED, copilotTranscript.files);
    expect(files.map(({ path }) => path)).toEqual(["/home/node/.copilot/session-state/121a3d72-2085-45a2-90fc-5d512b6f8163/events.jsonl"]);

    const events = copilotTranscript.parse(files);

    const SUBAGENT_PROMPT =
      "Run the shell command `ls -la` in the current working directory (/workspace) and report the exact list of files you see. Do nothing else — no file creation, no modifications, no other commands. Return the raw output of `ls` in your report.";
    expect(events).toEqual([
      {
        kind: "message",
        role: "user",
        text: "First, run the shell command `echo one > one.txt` with your shell tool. Then start a sub-agent (with your task / sub-agent tool) whose job is to run `ls` in the shell and report the files it sees. Finally reply with the single word DONE.",
        agent: "main",
      },
      { kind: "message", role: "assistant", text: "I'll run the echo command and launch the sub-agent in parallel.", agent: "main" },
      { kind: "toolCall", tool: "bash", input: { command: "echo one > one.txt && cat one.txt", description: "Create one.txt with content" }, agent: "main" },
      {
        kind: "toolCall",
        tool: "task",
        input: { name: "ListFiles", agent_type: "task", description: "Run ls and report files", prompt: SUBAGENT_PROMPT, mode: "sync" },
        agent: "main",
      },
      { kind: "message", role: "user", text: SUBAGENT_PROMPT, agent: "subagent" },
      { kind: "toolCall", tool: "bash", input: { command: "ls -la", description: "List all files in /workspace with details" }, agent: "subagent" },
      { kind: "message", role: "assistant", text: expect.stringMatching(/^`ls -la` completed successfully \(exit code 0\)\. Raw output:\n\n```\ntotal 12\n/), agent: "subagent" },
      { kind: "message", role: "assistant", text: "DONE", agent: "main" },
      // The second turn, continuing the session.
      { kind: "message", role: "user", text: "Now run `cat one.txt` in the shell and reply with what it printed.", agent: "main" },
      { kind: "toolCall", tool: "bash", input: { command: "cat one.txt", description: "Print contents of one.txt" }, agent: "main" },
      { kind: "message", role: "assistant", text: "`one`", agent: "main" },
    ]);
  });
});
