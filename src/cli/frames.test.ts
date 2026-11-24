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
import { frames, type Line } from "./frames.ts";

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

test("piped, an open line is written without its newline, and the next frame finishes it in place", () => {
  const out = new FakeOutput();
  let lines: Line[] = [{ open: "Building b ... " }];
  const view = frames(out, () => lines, new FakeClock());
  const writes: string[] = [];
  const frame = (step: () => void) => {
    const before = out.text().length;
    step();
    writes.push(out.text().slice(before));
  };

  frame(() => view.update());
  lines = ["Building b ... done", { open: "Building c ... " }];
  frame(() => view.update());
  lines = ["Building b ... done", "Building c ... failed"];
  frame(() => view.stop());

  expect(writes).toEqual(["Building b ... ", "done\nBuilding c ... ", "failed\n"]);
});

test("on a terminal, each frame rewrites in place the lines from the first that changed, counting wrapped lines", () => {
  // 10 columns wide: a line of 22 characters takes 3.
  const out = new FakeOutput(true, 10);
  let lines = ["a", "b 1s", "c"];
  const view = frames(out, () => lines, new FakeClock());
  const writes: string[] = [];
  const frame = () => {
    const before = out.text().length;
    view.update();
    writes.push(out.text().slice(before));
  };

  frame();
  lines = ["a", "b 2s", "c"];
  frame();
  frame();
  lines = ["a", "b done", "c", "long line, wrapping 22"];
  frame();
  lines = ["a", "b done", "c", "x"];
  frame();

  expect(writes).toEqual([
    "a\nb 1s\nc\n",
    "\x1b[2F\x1b[Jb 2s\nc\n",
    "",
    "\x1b[2F\x1b[Jb done\nc\nlong line, wrapping 22\n",
    "\x1b[3F\x1b[Jx\n",
  ]);
});

test("on a terminal, redraws each second on the clock while a line counts, and stops once none does", async () => {
  const clock = new FakeClock(0, { graceMs: 10 });
  const out = new FakeOutput(true, 80);
  let building = true;
  // Counting, on a terminal, while building. Without the terminal, nothing counts.
  const render = (terminal: boolean) => (building ? (terminal ? [`Building b ... ${clock.now() / 1000}s`] : []) : ["Building b ... done"]);
  const view = frames(out, render, clock);

  view.update();
  await expect(clock.advance(1000)).resolves.toBeUndefined();
  await expect(clock.advance(1000)).resolves.toBeUndefined();
  building = false;
  view.update();

  expect(out.text()).toBe("Building b ... 0s\n\x1b[1F\x1b[JBuilding b ... 1s\n\x1b[1F\x1b[JBuilding b ... 2s\n\x1b[1F\x1b[JBuilding b ... done\n");
  // Nothing is left waiting on the clock.
  await expect(clock.advance(1000)).rejects.toThrow("nothing waited on the clock");
});
