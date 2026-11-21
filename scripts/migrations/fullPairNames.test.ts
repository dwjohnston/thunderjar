import { describe, expect, test } from "bun:test";
import { migratePair } from "./fullPairNames.ts";

describe("migratePair", () => {
  test("appends its harness's default parts", () => {
    expect(migratePair("codex-0.166.0/openai/gpt-6-luna")).toBe("codex-0.166.0/openai/gpt-6-luna/medium");
  });
});

describe("migratePair, run again", () => {
  test("leaves a full name, and a harness without defaults, as they are", () => {
    expect(migratePair("codex-0.166.0/openai/gpt-6-luna/medium")).toBe("codex-0.166.0/openai/gpt-6-luna/medium");
    expect(migratePair("claude-code-2.1.311/claude-haiku-5-5")).toBe("claude-code-2.1.311/claude-haiku-5-5");
  });
});
