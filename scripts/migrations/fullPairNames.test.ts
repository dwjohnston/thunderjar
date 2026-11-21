import { describe, expect, test } from "bun:test";
import { migratePair } from "./fullPairNames.ts";

describe("migratePair", () => {
  test("appends its harness's default parts", () => {
    expect(migratePair("codex-0.166.0/openai/gpt-6-luna")).toBe("codex-0.166.0/openai/gpt-6-luna/medium");
  });
});
