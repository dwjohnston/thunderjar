/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: be61f223-aa63-4d40-ae62-416f589479dc
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { expect, test } from "bun:test";
import { measure } from "thunderjar/testing";
import invokedA from "../invokedA.ts";
import invokedB from "../invokedB.ts";
import invokedBase from "../invokedBase.ts";

// A run that picked up the base skill and a's, as it should asked about a.ts, and not b's.
test("a run that invoked base and a counts as invoking them, and not b", async () => {
  const skillsInvoked = ["base", "a"];
  expect((await measure(invokedBase, { skillsInvoked })).metrics).toEqual({ invokedBase: true });
  expect((await measure(invokedA, { skillsInvoked })).metrics).toEqual({ invokedA: true });
  expect((await measure(invokedB, { skillsInvoked })).metrics).toEqual({ invokedB: false });
});

test("a run that invoked no skill counts as invoking none of them", async () => {
  expect((await measure(invokedBase, { skillsInvoked: [] })).metrics).toEqual({ invokedBase: false });
});
