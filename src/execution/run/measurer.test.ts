/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiApELUXheYNb6d7F3
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { describe, expect, it } from "bun:test";
import { ConfigError } from "../../config/loader.ts";
import { FakeClock } from "../../services/Clock/FakeClock.ts";
import { FakeDocker } from "../../services/Docker/FakeDocker.ts";
import { scenario } from "../../testing/scenario.ts";
import { createMeasurer } from "./measurer.ts";
import { START_TIME } from "./testSupport.ts";

// The declarations are a project's own code, so these read real fixture projects.
const rootOf = (id: string) => `${scenario(id)}/.thunderjar`;
const ALPHA = { name: "fake-harness-alpha", version: "1.0.0", modelId: "fake-model-small-001" };
// What fake-harness-alpha's agent leaves: shaped like Claude Code's result.
const RESULT = JSON.stringify({
  type: "result",
  result: "Arr, isPrime.ts be written.",
  modelUsage: { "fake-model-small-001": { inputTokens: 12000, outputTokens: 400, cacheReadInputTokens: 80, cacheCreationInputTokens: 0, costUSD: 0.061 } },
});

function aMeasurer() {
  const clock = new FakeClock(START_TIME);
  const docker = new FakeDocker(clock).addImage("postrun:1");
  return { clock, docker, measurer: createMeasurer({ docker, clock }) };
}

describe("createMeasurer: collect", () => {
  it("reads the reply and the token costs with the harness's own collectors", async () => {
    const { measurer } = aMeasurer();

    const collected = await measurer.collect({ root: rootOf("0202"), harness: ALPHA }, RESULT);

    expect(collected.reply).toEqual({ outcome: "collected", text: "Arr, isPrime.ts be written." });
    expect(collected.tokenCosts).toMatchObject({
      outcome: "collected",
      models: [{ model: "fake-model-small-001", inputTokens: 12000, outputTokens: 400, cacheReadTokens: 80, costUsd: 0.061 }],
    });
  });

  it("says why there is no reply or cost for a run that left no result file", async () => {
    const { measurer } = aMeasurer();

    expect(await measurer.collect({ root: rootOf("0202"), harness: ALPHA }, null)).toEqual({
      reply: { outcome: "unavailable", reason: "the agent left no result file" },
      tokenCosts: { outcome: "unavailable", reason: "absent" },
    });
  });

  it("says so for a harness with no collectors", async () => {
    const { measurer } = aMeasurer();

    expect(await measurer.collect({ root: rootOf("0202"), harness: { ...ALPHA, name: "fake-echo" } }, "anything")).toEqual({
      reply: { outcome: "unavailable", reason: "its harness has no collectReply" },
      tokenCosts: { outcome: "unavailable", reason: "notReported" },
    });
  });

  it("throws a ConfigError for a harness whose declaration can't be loaded", async () => {
    const { measurer } = aMeasurer();

    const failure = await measurer.collect({ root: rootOf("0202"), harness: { ...ALPHA, name: "no-such-harness" } }, RESULT).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConfigError);
    expect((failure as Error).message).toContain("parameters/harnessModels/no-such-harness/index.ts");
  });
});

describe("createMeasurer: measure", () => {
  const of = { root: rootOf("0206"), task: "env-measured", postrunImage: "postrun:1", container: "run-1", secretEnv: ["FAKE_HARNESS_KEY"] };
  const recorded = { harnessResult: RESULT, reply: { outcome: "collected" as const, text: "Arr, isPrime.ts be written." } };

  it("takes the task's measurements in a measurement container from the postrun image, given the run's secrets by name", async () => {
    const { measurer, docker, clock } = aMeasurer();
    docker.onShell((command) => (command.startsWith("echo ") ? { stdout: "setting on\n", stderr: "", exitCode: 0 } : undefined));
    await clock.advance(2_000);

    const result = await measurer.measure(of, recorded);

    expect(result).toEqual({
      envSeen: {
        instrument: "shell",
        contentHash: expect.any(String),
        // From the clock it was given.
        measuredAt: "2027-01-15T08:00:02.000Z",
        outcome: { outcome: "measured", data: { exitCode: 0, stdout: "setting on\n", stdoutTruncated: false } },
      },
    });
    expect(docker.shells).toHaveLength(1);
    expect(docker.shells[0]).toMatchObject({ image: "postrun:1", name: "run-1-measure-1", env: ["FAKE_HARNESS_KEY"], closed: true });
  });

  it("numbers the measurement containers of each run from 1", async () => {
    const { measurer, docker } = aMeasurer();

    await measurer.measure(of, recorded);
    await measurer.measure({ ...of, container: "run-2" }, recorded);

    expect(docker.shells.map((shell) => shell.name)).toEqual(["run-1-measure-1", "run-2-measure-1"]);
  });

  it("gives a measurement that reads only what was recorded the reply, without a container", async () => {
    const { measurer, docker } = aMeasurer();

    const result = await measurer.measure({ ...of, root: rootOf("0202"), task: "is-prime" }, recorded);

    expect(result.saysArr?.outcome).toEqual({ outcome: "measured", data: true });
    expect(Object.keys(result).sort()).toEqual(["isPrimeShape", "isPrimeTests", "isPrimeTsExists", "saysArr", "tsIgnoreCount"]);
    // One container for all the others.
    expect(docker.shells.map((shell) => shell.name)).toEqual(["run-1-measure-1"]);
  });

  it("gives a run with no result file an empty one to measure", async () => {
    const { measurer } = aMeasurer();

    const result = await measurer.measure({ ...of, root: rootOf("0202"), task: "is-prime" }, { harnessResult: null, reply: { outcome: "unavailable", reason: "the agent left no result file" } });

    expect(result.saysArr?.outcome.outcome).not.toBe("erroredWhileMeasuring");
  });

  it("measures nothing, and opens no container, for a task with no measurements", async () => {
    const { measurer, docker } = aMeasurer();

    expect(await measurer.measure({ ...of, root: rootOf("0402"), task: "fizz-buzz" }, recorded)).toEqual({});
    expect(docker.calls).toEqual([]);
  });

  it("throws if the measurement container can't be started", async () => {
    const { measurer } = aMeasurer();

    await expect(measurer.measure({ ...of, postrunImage: "postrun:gone" }, recorded)).rejects.toThrow("No such image: postrun:gone");
  });
});
