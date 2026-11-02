// The Claude Code readers, against a real `claude -p --output-format json` result, from Claude Code
// 2.1.316 run on DeepSeek's Anthropic-compatible API, whose model its price table doesn't know.
import { describe, expect, test } from "bun:test";
import { claudeCodeReply, claudeCodeTokenCosts } from "./claudeCode.ts";

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
