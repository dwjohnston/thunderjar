/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLj17bvjTxKwnG6HoJE
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */
import { describe, expect, test } from "bun:test";
import { commitKind, isTestFile } from "./red-green.ts";

describe("commitKind", () => {
  test("reads the marker after a prefix", () => {
    expect(commitKind("🤖 Claude: 🔴 A variable passed with -e is in the postrun image")).toBe("red");
    expect(commitKind("🤖 Claude: 🔴🔴 Update expectations for 1-based line numbers")).toBe("multi-red");
    expect(commitKind("🟢 Blank what the prerun image doesn't set")).toBe("green");
    expect(commitKind("♻️ Refactor format handling into a reporters map")).toBe("refactor");
    expect(commitKind("Test support: the fake Docker models environments")).toBe("other");
  });

  test("ignores a marker the subject only mentions", () => {
    expect(commitKind("🤖 Claude: Let a 🔴🔴 commit fail several tests")).toBe("other");
    expect(commitKind("Explain 🟢 commits in AGENTS.md")).toBe("other");
  });

  test("reads a marker at the start, with a colon in the rest", () => {
    expect(commitKind("🔴 Docs: the link is broken")).toBe("red");
  });
});

describe("isTestFile", () => {
  test("is a test file, or a test's expected result", () => {
    expect(isTestFile("src/cli/commands/run/run.test.ts")).toBe(true);
    expect(isTestFile("src/docker/docker.docker.test.ts")).toBe(true);
    expect(isTestFile("src/cli/commands/view/app/ErrorBoundary.test.tsx")).toBe(true);
    expect(isTestFile("src/api/claudeCode.deepseek.result.json")).toBe(true);
    expect(isTestFile("src/testing/thunderjar.ts")).toBe(false);
  });

  test("leaves out the gauntlet's challenges", () => {
    expect(isTestFile("src/gauntlet/wrong-failing-test/test/retail/money.test.js")).toBe(false);
  });
});
