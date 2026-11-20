/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-sonnet-5-5
 * Session Id: session_01LCLeLjFb1Gy2NHaFDTB6tk
 *
 * Humans: add your notes here
 */

import { describe, expect, test } from "bun:test";
import { sessionPushArgs } from "./push.ts";

describe("sessionPushArgs", () => {
  test("pushes a branch-store session's branch", () => {
    expect(sessionPushArgs("origin", "abc", "branch")).toEqual([
      "push", "--no-verify", "origin", "refs/heads/thunderjar/capture/abc:refs/heads/thunderjar/capture/abc",
    ]);
  });

  test("pushes a refs-store session's refs", () => {
    expect(sessionPushArgs("up", "abc", "refs")).toEqual([
      "push", "--no-verify", "up", "refs/thunderjar/capture/abc/*:refs/thunderjar/capture/abc/*",
    ]);
  });
});
