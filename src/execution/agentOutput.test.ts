/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: c07c882c-639c-493c-8957-caa40aa841ac
 * Supervising engineer: blacksheep-bot
 *
 *
 * Humans: add your notes here
 *
 *
 */

import { describe, expect, test } from "bun:test";
import { agentOutput, head, RESULT_LIMIT, STDERR_LIMIT, storedStderr, tail } from "./agentOutput.ts";

describe("tail", () => {
  test("short text is kept whole", () => {
    expect(tail("boom", 10)).toBe("boom");
  });

  test("long text keeps its end, and says how much was cut", () => {
    expect(tail("0123456789", 4)).toBe("[6 characters cut]…6789");
  });
});

describe("head", () => {
  test("long text keeps its start, and says how much was cut", () => {
    expect(head("0123456789", 4)).toBe("0123…[6 characters cut]");
  });
});

describe("agentOutput", () => {
  test("each turn's stderr and result, trimmed, numbered from 1", () => {
    expect(agentOutput(['{"error":"crashed"}\n'], ["out of disk\n"])).toEqual([
      { turn: 1, stderr: "out of disk", result: '{"error":"crashed"}' },
    ]);
  });

  test("a turn that left nothing is left out, and an empty one leaves its field out", () => {
    expect(agentOutput([null, "", '{"ok":true}'], [null, "  \n", ""])).toEqual([{ turn: 3, result: '{"ok":true}' }]);
  });

  test("long output keeps its end", () => {
    const [output] = agentOutput(["r".repeat(RESULT_LIMIT + 5) + "END"], ["s".repeat(STDERR_LIMIT + 5) + "ERR"]);
    expect(output?.stderr).toEndWith("sERR");
    expect(output?.stderr).toStartWith("[8 characters cut]…");
    expect(output?.result).toEndWith("rEND");
  });
});

describe("storedStderr", () => {
  test("short text is kept whole, and null stays null", () => {
    expect(storedStderr("short", 16)).toBe("short");
    expect(storedStderr(null)).toBeNull();
  });

  test("long text keeps its last bytes, never part of a character", () => {
    expect(storedStderr("abcdef", 3)).toBe("def");
    // "é" is two bytes: the last 3 of "aébc" cut it in half, so it's dropped.
    expect(storedStderr("aéébc", 5)).toBe("ébc");
    expect(storedStderr("aébc", 3)).toBe("bc");
  });
});
