/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { describe, expect, test } from "bun:test";
import { config, fakes } from "../testing/fixtures.ts";
import { runTestCase } from "./runTestCase.ts";

describe(runTestCase, () => {
  test("a dry run leaves the manifest in the state, and asks nothing of Docker or the run data store", async () => {
    const deps = fakes();
    deps.random.setUlids("01exec");

    expect(await runTestCase(config({ permutationCount: 2 }), deps, "dry-run")).toBeUndefined();

    const { run } = deps.state.get();
    expect(run).toMatchObject({ mode: "dry-run", runs: {}, images: {}, manifest: { executionId: "01exec", runs: [{ runId: "01exec-p1000000-i1" }, { runId: "01exec-p2000000-i1" }] } });
    expect([...deps.hostDocker.calls, ...deps.runtimeDocker.calls]).toEqual([]);
    expect(await deps.runStore.listExecutions()).toEqual([]);
  });

  test("build-only makes the images ready, and runs and records nothing", async () => {
    const deps = fakes();

    expect(await runTestCase(config(), deps, "build-only")).toBeUndefined();

    expect(deps.state.get().run).toMatchObject({ mode: "build-only", runs: {}, images: { "thunderjar-prerun:i1000000": "ready" } });
    expect(deps.runtimeDocker.calls.some((call) => call.startsWith("run "))).toBe(false);
    expect(await deps.runStore.listExecutions()).toEqual([]);
  });

  test("a full run builds, then runs, and returns each run's record", async () => {
    const deps = fakes();

    const records = await runTestCase(config({ concurrency: 2 }), deps);

    expect(records).toMatchObject([{ outcome: "completed" }]);
    expect(deps.state.get().run.manifest?.concurrency).toBe(2);
    expect(deps.state.get().run.mode).toBeUndefined();
    expect(await deps.runStore.listExecutions()).toMatchObject([{ status: "complete" }]);
  });

  test("an image that can't be built is thrown, and nothing is run or recorded", async () => {
    const deps = fakes();
    deps.runtimeDocker.failNext("build", new Error("no such base image"));

    expect(runTestCase(config(), deps)).rejects.toThrow("no such base image");
    await deps.clock.advance(0);

    expect(await deps.runStore.listExecutions()).toEqual([]);
  });
});
