// The Copilot readers, against a `copilot --output-format json` result: JSON lines, one event each,
// with the usage line the run script appended.
import { describe, expect, test } from "bun:test";
import { copilotReply, copilotTokenCosts } from "./copilot.ts";

const RESULT = await Bun.file(`${import.meta.dir}/copilot.result.jsonl`).text();

describe("copilotReply", () => {
  test("is the main agent's last message with text, not a sub-agent's", () => {
    expect(copilotReply(RESULT)).toBe("pong");
  });

  test("throws when there is no assistant message", () => {
    expect(() => copilotReply("Error: rate limited")).toThrow();
    expect(() => copilotReply('{"type":"session.start"}')).toThrow();
  });
});

describe("copilotTokenCosts", () => {
  test("reads each model's tokens from the usage line, taking the cached ones out of the input, and reports no dollars", () => {
    expect(copilotTokenCosts(RESULT)).toEqual({
      outcome: "collected",
      models: [{ model: "claude-haiku-5.5", inputTokens: 500, outputTokens: 50, cacheReadTokens: 2000, cacheCreationTokens: 500 }],
      apiDurationMs: 4200,
    });
  });
});
