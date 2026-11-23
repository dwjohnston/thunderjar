// 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
// Supervising engineer: David Johnston. Humans: add your notes here.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { imageRef } from "./image.ts";
import { APP, fixture, machineFixture, type Fixture } from "./test/harness.ts";

let f: Fixture;
beforeEach(async () => {
  f = await fixture();
});
afterEach(async () => {
  await f.cleanup();
});

const guest = async () => (await f.machines()).map((machine) => machine.config.guest);

describe("up", () => {
  test("says the machine is stopped, then that it started and how long that took", async () => {
    const machine = await machineFixture({ state: "stopped" });
    await f.setMachines([machine]);

    const result = await f.run(["up"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain(`machine ${machine.name} (m-1) is stopped. Starting it…`);
    expect(result.stderr).toMatch(new RegExp(`machine ${machine.name} \\(m-1\\) started \\(\\d+s\\)`));
  });

  test("logs each step it waits on, and how long it took", async () => {
    await f.setMachines([await machineFixture({ state: "stopped" })]);

    await f.run(["up"]);

    const log = await Bun.file(`${f.dir}/fly-client.log`).text();
    for (const step of ["finding the machine", "starting m-1", "waiting for m-1 to be started", "waiting for the Docker daemon on m-1"]) {
      expect(log).toMatch(new RegExp(`\\] ${step}: done in \\d+s`));
    }
  });

  test("says there's no machine, then that it created and started one and how long that took", async () => {
    const result = await f.run(["up"]);

    const [machine] = await f.machines();
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain(`no machine in ${APP}. Creating ${machine?.name}…`);
    expect(result.stderr).toMatch(
      new RegExp(`machine ${machine?.name} \\(${machine?.id}\\) created and started \\(\\d+s\\)`),
    );
  });

  test("resizes an idle machine to FLYIO_INSTANCE_SIZE CPUs, with 2 GB a CPU", async () => {
    await f.setMachines([await machineFixture({ state: "started", cpus: 16 })]);

    const result = await f.run(["up"], { env: { FLYIO_INSTANCE_SIZE: "8" } });

    expect({ exitCode: result.exitCode, guest: await guest() }).toEqual({
      exitCode: 0,
      guest: [{ cpu_kind: "performance", cpus: 8, memory_mb: 16384 }],
    });
  });

  test("skips resizing while the machine is busy, as that restarts it", async () => {
    await f.setMachines([await machineFixture({ state: "started", cpus: 16 })]);
    await f.setRunning(["c0ffee"]);

    const result = await f.run(["up"], { env: { FLYIO_INSTANCE_SIZE: "8" } });

    expect({ exitCode: result.exitCode, guest: await guest() }).toEqual({
      exitCode: 0,
      guest: [{ cpu_kind: "performance", cpus: 16, memory_mb: 32768 }],
    });
    expect(result.stderr).toContain("not resizing m-1: 1 container is running");
  });

  test("builds and pushes the image when the recipe has changed, and moves an idle machine to it", async () => {
    const machine = await machineFixture({ state: "stopped" });
    await f.setMachines([{ ...machine, config: { ...machine.config, image: `registry.fly.io/${APP}:tj-000000000000` } }]);

    const result = await f.run(["up"]);

    const image = await imageRef(APP);
    expect({
      exitCode: result.exitCode,
      builds: (await f.callLines()).filter((line) => line.startsWith("fly deploy")),
      images: (await f.machines()).map((m) => m.config.image),
    }).toEqual({
      exitCode: 0,
      builds: [
        `fly deploy --build-only --push --image-label ${image.split(":")[1]} -a ${APP} --config fly.toml --dockerfile Dockerfile`,
      ],
      images: [image],
    });
  });
});
