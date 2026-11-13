/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLkjATuQXxaawiKKoPy
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { describe, expect, test } from "bun:test";
import { ConfigError } from "../config/loader.ts";
import { DockerContainerError, DockerPullError, DockerPushError, DockerUnavailableError } from "../docker/docker.ts";
import { type ContainerRunRecord, RunDataStoreError } from "../store/runDataStore.ts";
import type { PlannedIteration, PlannedPermutation } from "./planExecution.ts";
import type { RunHooks } from "./runExecution.ts";
import { errorOf, eventHooks, failureOf, replayEvent, type RunnerEvent, RunnerError } from "./runnerEvents.ts";
import type { PlanData } from "./runnerSpec.ts";

const iteration: PlannedIteration = { number: 2, postrunImage: "thunderjar-postrun:x-1-2" };
const permutation = { number: 1, iterations: [{ number: 1, postrunImage: "thunderjar-postrun:x-1-1" }, iteration] } as PlannedPermutation;
const plan = { executionId: "x", permutations: [permutation] } as PlanData;

describe("a runner's events", () => {
  test("each hook is written as an event, and replayed as the same hook, with the plan's own permutation and iteration", () => {
    const events: RunnerEvent[] = [];
    const hooks = eventHooks((event) => events.push(event));
    const record = { executionId: "x" } as ContainerRunRecord;
    hooks.onPulling?.("ref");
    hooks.onPulled?.("ref");
    hooks.onRunning?.(permutation, iteration);
    hooks.onRan?.(permutation, iteration, record);
    hooks.onPushing?.("image", "ref");
    hooks.onPushed?.("image", "ref");
    hooks.onMeasuring?.(permutation, iteration);
    hooks.onMeasured?.(permutation, iteration, {});
    hooks.onDone?.(permutation, iteration);
    hooks.onTimings?.({ wallMs: 5, phases: {} });

    const sent = JSON.parse(JSON.stringify(events)) as RunnerEvent[];
    const calls: unknown[][] = [];
    const replayed: RunHooks = {
      onPulling: (...args) => calls.push(["onPulling", ...args]),
      onPulled: (...args) => calls.push(["onPulled", ...args]),
      onRunning: (...args) => calls.push(["onRunning", ...args]),
      onRan: (...args) => calls.push(["onRan", ...args]),
      onPushing: (...args) => calls.push(["onPushing", ...args]),
      onPushed: (...args) => calls.push(["onPushed", ...args]),
      onMeasuring: (...args) => calls.push(["onMeasuring", ...args]),
      onMeasured: (...args) => calls.push(["onMeasured", ...args]),
      onDone: (...args) => calls.push(["onDone", ...args]),
      onTimings: (...args) => calls.push(["onTimings", ...args]),
    };
    for (const event of sent) replayEvent(event, replayed, plan);

    expect(calls).toEqual([
      ["onPulling", "ref"],
      ["onPulled", "ref"],
      ["onRunning", permutation, iteration],
      ["onRan", permutation, iteration, record],
      ["onPushing", "image", "ref"],
      ["onPushed", "image", "ref"],
      ["onMeasuring", permutation, iteration],
      ["onMeasured", permutation, iteration, {}],
      ["onDone", permutation, iteration],
      ["onTimings", { wallMs: 5, phases: {} }],
    ]);
    // The plan's own objects, not copies: the display keys its rows by them.
    expect(calls[2]?.[1]).toBe(permutation);
  });

  test("an event for an iteration the plan doesn't have is ignored", () => {
    let called = false;
    replayEvent({ event: "running", permutation: 9, iteration: 1 }, { onRunning: () => void (called = true) }, plan);
    expect(called).toBe(false);
  });

  test.each([
    [new DockerUnavailableError("no daemon"), DockerUnavailableError],
    [new DockerPullError("denied", "ghcr.io/a/b:c"), DockerPullError],
    [new DockerPushError("denied", "ghcr.io/a/b:c"), DockerPushError],
    [new DockerContainerError("no such container"), DockerContainerError],
    [new RunDataStoreError("Postgres at $DB", "unreachable"), RunDataStoreError],
    [new ConfigError("a harness is missing"), ConfigError],
    [new Error("anything else"), RunnerError],
  ])("%p is reported, and thrown again by whoever follows, as the same kind of error", (error, kind) => {
    const thrown = errorOf(JSON.parse(JSON.stringify(failureOf(error))));

    expect(thrown).toBeInstanceOf(kind);
    expect(thrown.message).toBe(error.message);
    expect((thrown as { reference?: string }).reference).toBe((error as { reference?: string }).reference);
    expect((thrown as { path?: string }).path).toBe((error as { path?: string }).path);
  });
});
