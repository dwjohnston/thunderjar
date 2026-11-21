// The Claude Code readers, against a real `claude -p --output-format json` result, from Claude Code
// 2.1.316 run on DeepSeek's Anthropic-compatible API, whose model its price table doesn't know.
import { describe, expect, test } from "bun:test";
import { transcriptFiles } from "../testing/transcripts.ts";
import { claudeCode, claudeCodeReply, claudeCodeTokenCosts, claudeCodeTranscript } from "./claudeCode.ts";
import { declaredBy } from "./declarations.ts";

const REAL = await Bun.file(`${import.meta.dir}/claudeCode.deepseek.result.json`).text();

/** The real result, changed by `change`. */
const changed = (change: (result: Record<string, unknown>) => void) => {
  const result = JSON.parse(REAL) as Record<string, unknown>;
  change(result);
  return JSON.stringify(result);
};

describe("claudeCodeReply", () => {
  test("is the result's text", () => {
    expect(claudeCodeReply(REAL)).toBe("pong");
  });

  test("throws for anything else", () => {
    expect(() => claudeCodeReply("Error: rate limited")).toThrow();
    expect(() => claudeCodeReply('{"type":"system"}')).toThrow();
  });
});

describe("claudeCodeTokenCosts", () => {
  test("reads each model's four buckets, cost and cost basis from modelUsage, and the API duration", () => {
    expect(claudeCodeTokenCosts(REAL)).toEqual({
      outcome: "collected",
      models: [
        {
          model: "deepseek-chat",
          inputTokens: 11078,
          outputTokens: 3,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          costUsd: 0.044371999999999995,
          costBasis: "unknown",
        },
      ],
      apiDurationMs: 1293,
    });
  });

  test("reads modelUsage, not the flat usage, which leaves out what sub-agents spent", () => {
    const delegated = changed((result) => {
      (result.modelUsage as Record<string, unknown>)["claude-haiku-4-5"] = {
        inputTokens: 500,
        outputTokens: 40,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        costUSD: 0.0007,
        costBasis: "list",
      };
    });
    const costs = claudeCodeTokenCosts(delegated);
    expect(costs.outcome === "collected" && costs.models.map(({ model }) => model)).toEqual(["deepseek-chat", "claude-haiku-4-5"]);
  });

  test("a result that counted nothing, as a crashed session's, is notReported", () => {
    const zeroed = changed((result) => {
      result.modelUsage = { "deepseek-chat": { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: 0 } };
    });
    expect(claudeCodeTokenCosts(zeroed)).toEqual({ outcome: "unavailable", reason: "notReported" });
    expect(claudeCodeTokenCosts(changed((result) => (result.modelUsage = {})))).toEqual({ outcome: "unavailable", reason: "notReported" });
  });

  test("anything that isn't a result is unparseable", () => {
    expect(claudeCodeTokenCosts("")).toEqual({ outcome: "unavailable", reason: "unparseable" });
    expect(claudeCodeTokenCosts("Error: Invalid API key")).toEqual({ outcome: "unavailable", reason: "unparseable" });
    expect(claudeCodeTokenCosts(changed((result) => delete result.modelUsage))).toEqual({ outcome: "unavailable", reason: "unparseable" });
    expect(
      claudeCodeTokenCosts(changed((result) => ((result.modelUsage as Record<string, Record<string, unknown>>)["deepseek-chat"]!.inputTokens = "many"))),
    ).toEqual({ outcome: "unavailable", reason: "unparseable" });
  });
});

describe("claudeCode", () => {
  const harness = claudeCode({ version: "2.1.311" });

  test("is a harness declaration, pinning its version", () => {
    expect(declaredBy(harness)).toBe("declareHarness");
    expect(harness.version).toBe("2.1.311");
    expect(harness.requiredEnv).toEqual([{ oneOf: ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"] }]);
  });

  test("installs Claude Code as root, writes the model and run script, then runs as node", () => {
    expect(harness.applyParameter(undefined, { dir: "parameters/harness", version: "2.1.311", modelId: "claude-haiku-5-5", resolved: undefined })).toBe(
      `RUN npm install -g @anthropic-ai/claude-code@2.1.311
RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar
COPY <<'THUNDERJAR_EOF' /thunderjar/model.txt
claude-haiku-5-5
THUNDERJAR_EOF
COPY --chmod=755 <<'THUNDERJAR_EOF' /thunderjar/thunderjar-run.sh
#!/bin/sh
claude -p "$(cat /thunderjar/prompt.txt)" --model "$(cat /thunderjar/model.txt)" --output-format json --dangerously-skip-permissions > /thunderjar/result.json
THUNDERJAR_EOF
USER node`,
    );
  });

  test("reads its reply and token costs with the library's readers", () => {
    expect(harness.collectReply?.(REAL)).toBe("pong");
    expect(harness.collectTokenCosts?.(REAL, { version: "2.1.311", modelId: "deepseek-v4-pro" })).toEqual(claudeCodeTokenCosts(REAL));
  });

  test("reads its transcript with the library's parser, from the home of the node user it runs as", () => {
    expect(harness.transcript).toBe(claudeCodeTranscript);
  });

  test("its command can be replaced", () => {
    const custom = claudeCode({ version: "2.1.311", command: "claude -p hi > /thunderjar/result.json" });

    expect(custom.applyParameter(undefined, { dir: "parameters/harness", version: "2.1.311", modelId: "m", resolved: undefined })).toContain(
      "#!/bin/sh\nclaude -p hi > /thunderjar/result.json\n",
    );
  });
});

describe("claudeCodeTranscript", () => {
  // Claude Code 2.1.326, on DeepSeek's Anthropic-compatible API: asked to run a command, start a
  // sub-agent that runs `ls`, and reply DONE, then, with `claude -c`, to run `cat one.txt`.
  const SAVED = "claude-code-2.1.326";

  test("reads the session's messages and tool calls, its sub-agent's among them, in the order they happened", async () => {
    const files = await transcriptFiles(SAVED, claudeCodeTranscript.files);
    // The session, and its sub-agent's beside it.
    expect(files.map(({ path }) => path)).toEqual([
      "/home/node/.claude/projects/-workspace/685673ef-a5a1-4b45-861b-abfa4f300c10.jsonl",
      "/home/node/.claude/projects/-workspace/685673ef-a5a1-4b45-861b-abfa4f300c10/subagents/agent-a339595684dac7eac.jsonl",
    ]);

    const events = claudeCodeTranscript.parse(files);

    expect(events).toEqual([
      {
        kind: "message",
        role: "user",
        text: "First, run the shell command `echo one > one.txt` with your Bash tool. Then use your Agent tool to start a general-purpose sub-agent whose job is to run `ls` with Bash and report the files it sees. Finally reply with the single word DONE.",
        agent: "main",
      },
      { kind: "toolCall", tool: "Bash", input: { command: "echo one > one.txt", description: 'Create one.txt containing "one"' }, agent: "main" },
      {
        kind: "toolCall",
        tool: "Agent",
        input: {
          description: "Run ls and report files",
          prompt: "Run the shell command `ls` with your Bash tool in the current working directory (/workspace) and report the list of files and directories you see in your final message. Do not modify anything.",
          subagent_type: "general-purpose",
          run_in_background: false,
        },
        agent: "main",
      },
      {
        kind: "message",
        role: "user",
        text: "Run the shell command `ls` with your Bash tool in the current working directory (/workspace) and report the list of files and directories you see in your final message. Do not modify anything.",
        agent: "subagent",
      },
      { kind: "toolCall", tool: "Bash", input: { command: "ls -la /workspace", description: "List files in /workspace" }, agent: "subagent" },
      {
        kind: "message",
        role: "assistant",
        text: "Ran `ls -la /workspace`. The directory contains a single entry:\n\n- `one.txt` — a regular file, 4 bytes, owner `node`, permissions `-rw-r--r--`, last modified Nov 21 04:20.\n\nNo subdirectories are present. Nothing was modified.",
        agent: "subagent",
      },
      { kind: "message", role: "assistant", text: "DONE", agent: "main" },
      // The second turn, in the same session.
      { kind: "message", role: "user", text: "Now run `cat one.txt` with Bash and reply with what it printed.", agent: "main" },
      { kind: "toolCall", tool: "Bash", input: { command: "cat one.txt", description: "Print contents of one.txt" }, agent: "main" },
      { kind: "message", role: "assistant", text: "It printed:\n\n```\none\n```", agent: "main" },
    ]);
  });
});
