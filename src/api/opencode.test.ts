// The OpenCode readers, against an `opencode run --format json` result: JSON lines, one event each.
import { describe, expect, test } from "bun:test";
import { opencodeReply, opencodeTokenCosts } from "./opencode.ts";

const RESULT = await Bun.file(`${import.meta.dir}/opencode.result.jsonl`).text();

describe("opencodeReply", () => {
  test("is the text of the last step, skipping lines that aren't JSON", () => {
    expect(opencodeReply(RESULT)).toBe("pong");
    expect(opencodeReply(`warning\n${RESULT}`)).toBe("pong");
  });

  test("throws when there is no text event", () => {
    expect(() => opencodeReply("Error: rate limited")).toThrow();
    expect(() => opencodeReply('{"type":"step_start"}')).toThrow();
  });
});

describe("opencodeTokenCosts", () => {
  test("sums every step, adding reasoning to the output, with OpenCode's own cost estimate", () => {
    expect(opencodeTokenCosts(RESULT, "openrouter/x")).toEqual({
      outcome: "collected",
      models: [
        { model: "openrouter/x", inputTokens: 1200, outputTokens: 65, cacheReadTokens: 1500, cacheCreationTokens: 500, costUsd: 0.003, costBasis: "list" },
      ],
    });
  });
});
