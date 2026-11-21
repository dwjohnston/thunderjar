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

  test("destroys the machine and its volume once the destroy deadline has passed, and ends the timer", async () => {
    await f.setMachines([await machineFixture({ state: "stopped" })]);

    await watchTimer({ stopIn: -60, destroyIn: -1 });

    const exited = await Promise.race([watcher!.exited.then(() => true), Bun.sleep(3000).then(() => false)]);
    expect({
      exited,
      machines: await f.machines(),
      volumesDestroyed: (await f.callLines()).filter((line) => line.startsWith("fly volumes destroy")),
      timer: await Bun.file(f.timerFile).exists(),
    }).toEqual({
      exited: true,
      machines: [],
      volumesDestroyed: [`fly volumes destroy vol_1 -a ${APP} --yes`],
      timer: false,
    });
  });

  test("skips stopping and destroying while containers are running, and acts once they've stopped", async () => {
    await f.setMachines([await machineFixture({ state: "started" })]);
    await f.setRunning(["c0ffee"]);

    await watchTimer({ stopIn: -60, destroyIn: -1 });
    // About 10 of its checks.
    await Bun.sleep(1000);
    const whileRunning = await state();

    await f.setRunning([]);
    await Promise.race([watcher!.exited, Bun.sleep(3000)]);

    expect({ whileRunning, after: await state() }).toEqual({ whileRunning: ["started"], after: [] });
  });

  test("skips stopping while a docker command is still running, e.g. a long build", async () => {
    await f.setMachines([await machineFixture({ state: "started" })]);
    const build = f.spawn(["docker", "build", "--fake-hang", "."]);
    await eventually(() => Bun.file(`${f.dir}/hanging`).exists());

    await watchTimer({ stopIn: -1, destroyIn: 60 });
    // About 10 of its checks.
    await Bun.sleep(1000);
    const whileBuilding = await state();
    build.kill();
    await build.exited;

    expect(whileBuilding).toEqual(["started"]);
  });
});
