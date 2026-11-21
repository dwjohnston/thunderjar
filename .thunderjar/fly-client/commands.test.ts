// 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
// Supervising engineer: David Johnston. Humans: add your notes here.

// stop, destroy, status and prune.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { APP, fixture, machineFixture, type Fixture } from "./test/harness.ts";

let f: Fixture;
beforeEach(async () => {
  f = await fixture();
});
afterEach(async () => {
  await f.cleanup();
});

const states = async () => (await f.machines()).map((machine) => machine.state);

describe("stop", () => {
  test("stops the machine if it's idle, and a busy one only with --force", async () => {
    await f.setMachines([await machineFixture({ state: "started" })]);
    await f.setRunning(["c0ffee"]);

    const busy = await f.run(["stop"]);
    const whileBusy = await states();
    const forced = await f.run(["stop", "--force"]);

    expect({ busy: busy.exitCode, whileBusy, forced: forced.exitCode, after: await states() }).toEqual({
      busy: 1,
      whileBusy: ["started"],
      forced: 0,
      after: ["stopped"],
    });
    expect(busy.stderr).toContain("1 container is running");
  });
});

describe("destroy", () => {
  test("destroys the machine and its volumes if it's idle, and a busy one only with --force", async () => {
    await f.setMachines([await machineFixture({ state: "started" })]);
    await f.setRunning(["c0ffee"]);

    const busy = await f.run(["destroy"]);
    const whileBusy = await states();
    const forced = await f.run(["destroy", "--force"]);

    expect({
      busy: busy.exitCode,
      whileBusy,
      forced: forced.exitCode,
      after: await states(),
      volumesDestroyed: (await f.callLines()).filter((line) => line.startsWith("fly volumes destroy")),
    }).toEqual({
      busy: 1,
      whileBusy: ["started"],
      forced: 0,
      after: [],
      volumesDestroyed: [`fly volumes destroy vol_1 -a ${APP} --yes`],
    });
  });
});

describe("status", () => {
  const timer = {
    app: APP,
    machineId: "m-1",
    lastCommandFinishedAt: "2026-11-21T00:40:00.000Z",
    stopAt: "2026-11-21T01:10:00.000Z",
    destroyAt: "2026-11-28T00:40:00.000Z",
    // No process has this PID: Linux's PIDs stop at 2^22.
    watcherPid: 99999999,
  };

  test("--json gives the machine's state and size, and the timer", async () => {
    await f.setMachines([await machineFixture({ state: "started", cpus: 8 })]);
    await Bun.write(f.timerFile, JSON.stringify(timer));

    const result = await f.run(["status", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      app: APP,
      machine: { id: "m-1", state: "started", region: "syd", size: { cpu_kind: "performance", cpus: 8, memory_mb: 16384 } },
      timer: { ...timer, watcherRunning: false },
    });
  });
});
