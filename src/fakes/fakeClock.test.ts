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

import { expect, test } from "bun:test";
import { FakeClock } from "./fakeClock.ts";

test("advance fires each sleep due by then, in time order, at its time", async () => {
  const clock = new FakeClock();
  const fired: string[] = [];
  void clock.sleep(300).then(() => fired.push(`b@${clock.now()}`));
  void clock.sleep(100).then(() => fired.push(`a@${clock.now()}`));
  void clock.sleep(600).then(() => fired.push(`c@${clock.now()}`));

  await clock.advance(500);

  expect({ fired, now: clock.now() }).toEqual({ fired: ["a@100", "b@300"], now: 500 });
});

test("advance first waits for the code under test to reach the clock, e.g. after reading a file", async () => {
  const clock = new FakeClock();
  let done = false;
  void (async () => {
    await Bun.file(import.meta.path).text();
    await clock.sleep(100);
    done = true;
  })();

  await clock.advance(100);

  expect(done).toBe(true);
});

test("an aborted sleep rejects with the signal's reason, and never fires", async () => {
  const clock = new FakeClock();
  const outcomes: string[] = [];
  const controller = new AbortController();
  clock.sleep(100, { signal: controller.signal }).then(
    () => outcomes.push(`aborted sleep fired@${clock.now()}`),
    (error: Error) => outcomes.push(`aborted sleep rejected: ${error.message}`),
  );
  void clock.sleep(200).then(() => outcomes.push(`other sleep fired@${clock.now()}`));

  controller.abort(new Error("stopped"));
  await clock.advance(200);

  expect(outcomes).toEqual(["aborted sleep rejected: stopped", "other sleep fired@200"]);
});

test("advance throws, rather than hangs, if nothing waits on the clock", async () => {
  const clock = new FakeClock(0, { graceMs: 10 });

  const outcome = await clock.advance(100).then(
    () => "moved on",
    (error: Error) => error.message,
  );

  expect(outcome).toBe(
    "FakeClock.advance(100): nothing waited on the clock within 10ms. The code under test finished, or is doing real I/O between clock waits, where only services may.",
  );
});
