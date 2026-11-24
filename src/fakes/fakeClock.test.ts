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
