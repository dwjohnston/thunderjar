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
import { commitKind } from "./red-green.ts";

describe("commitKind", () => {
  test("reads the marker after a prefix", () => {
    expect(commitKind("🤖 Claude: 🔴 A variable passed with -e is in the postrun image")).toBe("red");
    expect(commitKind("🤖 Claude: 🔴🔴 Update expectations for 1-based line numbers")).toBe("multi-red");
    expect(commitKind("🟢 Blank what the prerun image doesn't set")).toBe("green");
    expect(commitKind("♻️ Refactor format handling into a reporters map")).toBe("refactor");
    expect(commitKind("Test support: the fake Docker models environments")).toBe("other");
  });
});
