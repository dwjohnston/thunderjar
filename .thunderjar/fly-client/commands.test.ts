// 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
// Supervising engineer: David Johnston. Humans: add your notes here.

// stop, destroy, status and prune.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { fixture, machineFixture, type Fixture } from "./test/harness.ts";

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
