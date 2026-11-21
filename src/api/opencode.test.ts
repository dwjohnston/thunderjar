// OpenCode's transcript parser, against what OPENCODE_TRANSCRIPT_COMMAND wrote of a real session.
import { describe, expect, test } from "bun:test";
import { transcriptFiles } from "../testing/transcripts.ts";
import { opencodeTranscript } from "./opencode.ts";

describe("opencodeTranscript", () => {
  // OpenCode 1.19.5, on DeepSeek: asked to run a command, start a sub-agent that runs `ls`, and
  // reply DONE, then, with `opencode run --continue`, to run `cat one.txt`. OpenCode keeps the
  // prompts as `opencode run` was given them, in quotes.
  const SAVED = "opencode-1.19.5";

  test("reads the session's messages and tool calls, its sub-agent's among them, in the order they happened", async () => {
    const files = await transcriptFiles(SAVED, opencodeTranscript.files);
    expect(files.map(({ path }) => path)).toEqual(["/home/node/.local/share/opencode/thunderjar-transcript.json"]);

    const events = opencodeTranscript.parse(files);

    const SUBAGENT_PROMPT = "Run the shell command `ls` in the /workspace directory and report back the exact list of files you see. Do not modify anything.";
    expect(events).toEqual([
      {
        kind: "message",
        role: "user",
        text: '"First, run the shell command `echo one > one.txt` with your shell tool. Then start a sub-agent (with your task / sub-agent tool) whose job is to run `ls` in the shell and report the files it sees. Finally reply with the single word DONE."',
        agent: "main",
      },
      { kind: "message", role: "assistant", text: "I'll run the command and start the sub-agent.", agent: "main" },
      { kind: "toolCall", tool: "bash", input: { command: "echo one > one.txt" }, agent: "main" },
      { kind: "toolCall", tool: "task", input: { description: "List files in shell", prompt: SUBAGENT_PROMPT, subagent_type: "explore" }, agent: "main" },
      { kind: "message", role: "user", text: SUBAGENT_PROMPT, agent: "subagent" },
      { kind: "toolCall", tool: "bash", input: { command: "ls", workdir: "/workspace" }, agent: "subagent" },
      { kind: "message", role: "assistant", text: expect.stringMatching(/^I ran `ls` in `\/workspace`\. The exact output is one entry:/), agent: "subagent" },
      { kind: "message", role: "assistant", text: "DONE", agent: "main" },
      // The second turn, continuing the session.
      { kind: "message", role: "user", text: '"Now run `cat one.txt` in the shell and reply with what it printed."', agent: "main" },
      { kind: "toolCall", tool: "bash", input: { command: "cat one.txt" }, agent: "main" },
      { kind: "message", role: "assistant", text: "one", agent: "main" },
    ]);
  });
});
