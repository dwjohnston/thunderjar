// The Codex readers, against a `codex exec --json` result: JSON lines, one event each.
import { describe, expect, test } from "bun:test";
import { codexReply, codexTokenCosts } from "./codex.ts";

const RESULT = await Bun.file(`${import.meta.dir}/codex.result.jsonl`).text();

describe("codexReply", () => {
  test("is the last completed agent message with text, skipping empty ones and lines that aren't JSON", () => {
    expect(codexReply(RESULT)).toBe("pong");
    expect(codexReply(`warning: something\n${RESULT}{"type":"item.completed","item":{"type":"agent_message","text":"  "}}\n`)).toBe("pong");
  });

  test("throws when there is no agent message", () => {
    expect(() => codexReply("Error: rate limited")).toThrow();
    expect(() => codexReply('{"type":"turn.started"}')).toThrow();
  });
});

describe("codexTokenCosts", () => {
  test("sums every turn, taking the cached tokens out of the input, as one entry for the model ID", () => {
    expect(codexTokenCosts(RESULT, "openai/gpt-5.5")).toEqual({
      outcome: "collected",
      models: [{ model: "openai/gpt-5.5", inputTokens: 400, outputTokens: 45, cacheReadTokens: 2100, cacheCreationTokens: 0 }],
    });
  });

  test("a run with no turn.completed, or no tokens, is notReported", () => {
    expect(codexTokenCosts("", "m")).toEqual({ outcome: "unavailable", reason: "notReported" });
    expect(codexTokenCosts('{"type":"turn.completed","usage":{"input_tokens":0,"output_tokens":0}}', "m")).toEqual({
      outcome: "unavailable",
      reason: "notReported",
    });
  });
});
