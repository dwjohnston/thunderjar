/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLi84J7b2Ykdumve3HN
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */


// frames, on a FakeOutput, piped or a terminal, with a FakeClock: the raw text written, escape
// codes included.
import { expect, test } from "bun:test";
import { FakeClock } from "../fakes/fakeClock.ts";
import { FakeOutput } from "../fakes/fakeIo.ts";
import { frames } from "./frames.ts";

test("piped, each frame writes only the lines added since the last", () => {
  const out = new FakeOutput();
  let lines = ["a"];
  const view = frames(out, () => lines, new FakeClock());

  view.update();
  lines = ["a", "b", "c"];
  view.update();
  view.stop();

  expect(out.text()).toBe("a\nb\nc\n");
});
