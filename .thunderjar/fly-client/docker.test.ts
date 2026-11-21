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
});
