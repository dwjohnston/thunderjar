// 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
// Supervising engineer: David Johnston. Humans: add your notes here.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { fixture, machineFixture, type Fixture } from "./test/harness.ts";

let f: Fixture;
beforeEach(async () => {
  f = await fixture();
});
afterEach(async () => {
  await f.cleanup();
});

const guest = async () => (await f.machines()).map((machine) => machine.config.guest);

describe("up", () => {
  test("resizes an idle machine to FLYIO_INSTANCE_SIZE CPUs, with 2 GB a CPU", async () => {
    await f.setMachines([await machineFixture({ state: "started", cpus: 16 })]);

    const result = await f.run(["up"], { env: { FLYIO_INSTANCE_SIZE: "8" } });

    expect({ exitCode: result.exitCode, guest: await guest() }).toEqual({
      exitCode: 0,
      guest: [{ cpu_kind: "performance", cpus: 8, memory_mb: 16384 }],
    });
  });
});
