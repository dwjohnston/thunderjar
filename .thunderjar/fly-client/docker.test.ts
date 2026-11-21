// 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
// Supervising engineer: David Johnston. Humans: add your notes here.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { fixture, machineFixture, type Fixture, type Machine } from "./test/harness.ts";

let f: Fixture;
beforeEach(async () => {
  f = await fixture();
});
afterEach(async () => {
  await f.cleanup();
});

describe("docker", () => {
  test("forwards its arguments, stdin, output and exit code to the machine's daemon", async () => {
    await f.setMachines([await machineFixture({ state: "started" })]);
    await f.setExitCode(3);

    const result = await f.run(["docker", "exec", "-i", "tj-run-4f2a", "git", "log"], { stdin: "from the client" });

    expect(result).toEqual({
      exitCode: 3,
      stdout: "from the client",
      stderr: "fake docker ran: exec -i tj-run-4f2a git log\n",
    });
    const docker = (await f.calls()).filter((call) => call.command === "docker");
    expect(docker.map((call) => call.args)).toEqual([["-H", "ssh://tjfly", "exec", "-i", "tj-run-4f2a", "git", "log"]]);
  });

  test("adds --network host to build, so its steps can resolve names", async () => {
    await f.setMachines([await machineFixture({ state: "started" })]);

    const result = await f.run(["docker", "build", "-t", "tj-prerun-h1a2b3c", "/tmp/tj-build-x7k2"]);

    expect(result.exitCode).toBe(0);
    const docker = (await f.calls()).filter((call) => call.command === "docker");
    expect(docker.map((call) => call.args)).toEqual([
      ["-H", "ssh://tjfly", "build", "--network", "host", "-t", "tj-prerun-h1a2b3c", "/tmp/tj-build-x7k2"],
    ]);
  });

  test("runs up only when the machine is missing or stopped", async () => {
    // What changes the machine, each as its first two words, e.g. "machine start".
    const lifecycle = async (machines: Machine[]): Promise<string[]> => {
      const each = await fixture();
      try {
        await each.setMachines(machines);
        const result = await each.run(["docker", "ps"]);
        expect(result.exitCode).toBe(0);
        return (await each.calls())
          .filter((call) => call.command === "fly")
          .map((call) => call.args.slice(0, 2).join(" "))
          .filter((call) => !["machine list", "machine wait", "ssh issue", "volumes list"].includes(call));
      } finally {
        await each.cleanup();
      }
    };

    expect({
      started: await lifecycle([await machineFixture({ state: "started" })]),
      stopped: await lifecycle([await machineFixture({ state: "stopped" })]),
      missing: await lifecycle([]),
    }).toEqual({
      started: [],
      stopped: ["machine start"],
      missing: ["deploy --build-only", "volumes create", "machine run"],
    });
  });

  test("gives ssh and docker FLY_API_TOKEN from FLYIO_TOKEN, for the fly ssh console their connection goes through", async () => {
    await f.setMachines([await machineFixture({ state: "started" })]);

    await f.run(["docker", "ps"]);

    const withoutToken = (await f.calls()).filter((call) => call.command !== "fly" && !call.flyToken);
    expect(withoutToken).toEqual([]);
  });
});
