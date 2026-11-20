import { expect, test } from "bun:test";
import { sessionPushArgs } from "./push.ts";

test("sessionPushArgs pushes one session's branch", () => {
  const spec = "refs/heads/thunderjar/capture/abc:refs/heads/thunderjar/capture/abc";
  expect(sessionPushArgs("origin", "branch", "abc")).toEqual(["push", "--no-verify", "origin", spec]);
});

test("sessionPushArgs pushes one session's refs", () => {
  const spec = "refs/thunderjar/capture/abc/*:refs/thunderjar/capture/abc/*";
  expect(sessionPushArgs("up", "refs", "abc")).toEqual(["push", "--no-verify", "up", spec]);
});
