// 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
// Supervising engineer: David Johnston. Humans: add your notes here.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { APP, fixture, machineFixture, type Fixture } from "./test/harness.ts";

let f: Fixture;
beforeEach(async () => {
  f = await fixture();
  await f.setMachines([await machineFixture({ state: "started" })]);
});
afterEach(async () => {
  await f.cleanup();
});

const MINUTE = 60 * 1000;

interface Timer {
  app: string;
  machineId: string;
  lastCommandFinishedAt: string;
  stopAt: string;
  destroyAt: string;
  watcherPid: number;
}

async function readTimer(): Promise<Timer> {
  const file = Bun.file(f.timerFile);
  expect(await file.exists()).toBe(true);
  return (await file.json()) as Timer;
}

/** Checks the timer was reset between `before` and `after`, with deadlines from the environment. */
function expectReset(timer: Timer, before: number, after: number, sleepMinutes: number, destroyMinutes: number) {
  const finished = Date.parse(timer.lastCommandFinishedAt);
  expect(finished).toBeGreaterThanOrEqual(before);
  expect(finished).toBeLessThanOrEqual(after);
  expect(timer).toMatchObject({
    app: APP,
    machineId: "m-1",
    stopAt: new Date(finished + sleepMinutes * MINUTE).toISOString(),
    destroyAt: new Date(finished + destroyMinutes * MINUTE).toISOString(),
  });
}

describe("the timer file", () => {
  test("is written when a docker command exits, whether it succeeds or fails", async () => {
    const env = { FLY_SLEEP_MINUTES: "15", FLY_DESTROY_MINUTES: "120" };

    let before = Date.now();
    expect((await f.run(["docker", "ps"], { env })).exitCode).toBe(0);
    expectReset(await readTimer(), before, Date.now(), 15, 120);

    await f.setExitCode(1);
    before = Date.now();
    expect((await f.run(["docker", "run", "busybox", "false"], { env })).exitCode).toBe(1);
    expectReset(await readTimer(), before, Date.now(), 15, 120);
  });
});
