import { expect, test } from "bun:test";
import { sessionPushArgs } from "./push.ts";

test("sessionPushArgs names only the session's refspec", () => {
  expect(sessionPushArgs("origin", "branch", "s1")).toEqual([
    "push", "--no-verify", "origin", "refs/heads/thunderjar/capture/s1:refs/heads/thunderjar/capture/s1",
  ]);
  expect(sessionPushArgs("up", "refs", "s1")).toEqual([
    "push", "--no-verify", "up", "refs/thunderjar/capture/s1/*:refs/thunderjar/capture/s1/*",
  ]);
});
