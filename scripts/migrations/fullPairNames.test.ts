import { describe, expect, test } from "bun:test";
import type { ContainerRunRecord } from "../../src/store/runDataStore.ts";
import { migratePair, migrateRun, migrateSource } from "./fullPairNames.ts";

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

describe("migrateSource", () => {
  test("migrates each quoted pair, and nothing else", () => {
    const source = `harnessModel: ["codex-0.166.0/openai/gpt-6-luna", 'claude-code-2.1.311/claude-haiku-5-5'],\n// codex-0.166.0/openai/gpt-6-luna in a comment\n`;

    expect(migrateSource(source)).toBe(
      `harnessModel: ["codex-0.166.0/openai/gpt-6-luna/medium", 'claude-code-2.1.311/claude-haiku-5-5'],\n// codex-0.166.0/openai/gpt-6-luna in a comment\n`,
    );
  });
});

describe("migrateRun", () => {
  test("migrates the name of its harness model pair, and keeps the rest", () => {
    const record = {
      executionId: "01m430hgt00w0g80g80m3g2102",
      parameters: { harnessModel: { name: "codex-0.166.0/openai/gpt-6-luna", parameterHash: "abc" }, task: { name: "is-prime", parameterHash: "def" } },
      harnessModel: { harness: "codex-0.166.0", version: "0.166.0", modelId: "openai/gpt-6-luna" },
    } as unknown as ContainerRunRecord;

    expect(migrateRun(record)).toEqual({
      ...record,
      parameters: { ...record.parameters, harnessModel: { name: "codex-0.166.0/openai/gpt-6-luna/medium", parameterHash: "abc" } },
    } as unknown as ContainerRunRecord);
  });
});
