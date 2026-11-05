// The Claude Code readers, against a real `claude -p --output-format json` result, from Claude Code
// 2.1.316 run on DeepSeek's Anthropic-compatible API, whose model its price table doesn't know.
import { describe, expect, test } from "bun:test";
import { claudeCode, claudeCodeReply, claudeCodeTokenCosts } from "./claudeCode.ts";
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
  const ctx = {
    version: "2.1.311",
    modelId: "claude-haiku-5-5",
    initialPrompt: "Go.",
    promptPath: "/thunderjar/prompt.txt",
    resultPath: "/thunderjar/result.json",
    sessionId: "0b9e8a52-2a4b-4c3e-9d3e-6f1c2b7a8d90",
    resolved: undefined,
  };

  test("is a harness declaration, pinning its version", () => {
    expect(declaredBy(harness)).toBe("declareHarness");
    expect(harness.version).toBe("2.1.311");
    expect(harness.requiredEnv).toEqual(["ANTHROPIC_API_KEY"]);
  });

  test("installs Claude Code as root, then runs as node", () => {
    expect(harness.applyParameter?.(undefined, { dir: "parameters/harness", version: "2.1.311", resolved: undefined })).toBe(
      `RUN npm install -g @anthropic-ai/claude-code@2.1.311
RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar
USER node`,
    );
  });

  test("starts the session on the first turn, and resumes it after", () => {
    expect(harness.cli({ ...ctx, turn: 0 })).toBe(
      'claude -p "$(cat /thunderjar/prompt.txt)" --model claude-haiku-5-5 --output-format json --dangerously-skip-permissions --session-id 0b9e8a52-2a4b-4c3e-9d3e-6f1c2b7a8d90 > /thunderjar/result.json',
    );
    expect(harness.cli({ ...ctx, turn: 1 })).toEndWith(" --resume 0b9e8a52-2a4b-4c3e-9d3e-6f1c2b7a8d90 > /thunderjar/result.json");
  });

  test("reads its reply and token costs with the library's readers", () => {
    expect(harness.collectReply?.(REAL)).toBe("pong");
    expect(harness.collectTokenCosts?.(REAL, { version: "2.1.311", modelId: "deepseek-v4-pro" })).toEqual(claudeCodeTokenCosts(REAL));
  });

  test("cli can be replaced", () => {
    const custom = claudeCode({ version: "2.1.311", cli: (c) => `claude -p hi --model ${c.modelId} > ${c.resultPath}` });

    expect(custom.cli({ ...ctx, turn: 0 })).toBe("claude -p hi --model claude-haiku-5-5 > /thunderjar/result.json");
  });
});
