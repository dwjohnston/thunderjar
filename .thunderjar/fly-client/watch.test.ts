// 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
// Supervising engineer: David Johnston. Humans: add your notes here.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { APP, eventually, fixture, machineFixture, type Fixture } from "./test/harness.ts";

let f: Fixture;
let watcher: Bun.Subprocess | undefined;
beforeEach(async () => {
  f = await fixture();
});
afterEach(async () => {
  watcher?.kill();
  await f.cleanup();
});

const MINUTE = 60 * 1000;

/** Writes a timer with deadlines this many minutes from now, and starts `watch` on it. */
async function watchTimer(deadlines: { stopIn: number; destroyIn: number }) {
  const now = Date.now();
  await Bun.write(
    f.timerFile,
    JSON.stringify({
      app: APP,
      machineId: "m-1",
      lastCommandFinishedAt: new Date(now - 60 * MINUTE).toISOString(),
      stopAt: new Date(now + deadlines.stopIn * MINUTE).toISOString(),
      destroyAt: new Date(now + deadlines.destroyIn * MINUTE).toISOString(),
    }),
  );
  watcher = f.spawn(["watch"]);
}

const state = async () => (await f.machines()).map((machine) => machine.state);

describe("watch", () => {
  test("stops the machine once the stop deadline has passed", async () => {
    await f.setMachines([await machineFixture({ state: "started" })]);

    await watchTimer({ stopIn: -1, destroyIn: 60 });

    let states: string[] = [];
    await eventually(async () => {
      states = await state();
      return states[0] === "stopped";
    }, 3000).catch(() => {});
    expect(states).toEqual(["stopped"]);
  });
});
