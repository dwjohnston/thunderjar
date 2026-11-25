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
import { plan } from "../plan/plan.ts";
import { config, fakes } from "../testing/fixtures.ts";
import type { TestCaseConfig } from "../types.ts";
import { runManifest } from "./runManifest.ts";

const planned = (overrides: Partial<TestCaseConfig> & { permutationCount?: number } = {}) => {
  const resolved = config(overrides);
  return { resolved, manifest: plan(resolved, { concurrency: resolved.concurrency, executionId: "01exec" }) };
};

const crash = () => ({ files: { "/thunderjar/run.json": JSON.stringify({ startedAt: 1_700_000_000_000, finishedAt: 1_700_000_001_000, exitCode: 1 }) } });

describe(runManifest, () => {
  test("records the execution as running, runs every run, then records it complete", async () => {
    const deps = fakes();
    const { resolved, manifest } = planned({ permutationCount: 2, iterations: 2 });

    const records = await runManifest(manifest, resolved, deps);

    expect(records.map(({ runId, outcome }) => `${runId} ${outcome}`)).toEqual([
      "01exec-oooooooo-i1 completed",
      "01exec-oooooooo-i2 completed",
      "01exec-xxxxxxxx-i1 completed",
      "01exec-xxxxxxxx-i2 completed",
    ]);
    expect(deps.state.history().map((state) => state.run.execution?.status)).toContain("running");
    expect(await deps.runStore.listExecutions()).toMatchObject([
      { executionId: "01exec", testCase: "example", task: "is-prime", status: "complete", matrix: { shape: [1, 1, 1, 2, 1], permutations: 2, iterations: 2 } },
    ]);
    expect(await deps.runStore.containerRunsOf("01exec")).toHaveLength(4);
  });

  test("every run is queued in the state before any starts", async () => {
    const deps = fakes();
    const { resolved, manifest } = planned({ permutationCount: 2 });

    await runManifest(manifest, resolved, deps);

    const queued = deps.state.history().find((state) => Object.keys(state.run.runs).length > 0);
    expect(queued?.run.runs).toEqual({ "01exec-oooooooo-i1": { status: "queued" }, "01exec-xxxxxxxx-i1": { status: "queued" } });
  });

  test("a run that crashes doesn't stop the rest, and the execution is failed", async () => {
    const deps = fakes();
    deps.runtimeDocker.onRun("-1-1", crash);
    const { resolved, manifest } = planned({ permutationCount: 2 });

    const records = await runManifest(manifest, resolved, deps);

    expect(records.map(({ outcome }) => outcome)).toEqual(["crashed", "completed"]);
    expect(await deps.runStore.listExecutions()).toMatchObject([{ status: "failed" }]);
  });

  test("with an image store, waits for every post-run image to upload", async () => {
    const deps = fakes();
    const { resolved, manifest } = planned({ permutationCount: 2, imageStore: { repository: "ghcr.io/acme/images" } });

    await runManifest(manifest, resolved, deps);

    expect(deps.runtimeDocker.calls.filter((call) => call.startsWith("push"))).toEqual([
      "push thunderjar-postrun:01exec-1-1 ghcr.io/acme/images:postrun-e01exec-hoooooooo-i00",
      "push thunderjar-postrun:01exec-2-1 ghcr.io/acme/images:postrun-e01exec-hxxxxxxxx-i00",
    ]);
    expect(Object.values(deps.state.get().run.runs).map(({ status }) => status)).toEqual(["uploaded", "uploaded"]);
    expect(deps.state.get().run.uploadBacklog).toBe(0);
  });

  test("an upload that fails fails the execution", async () => {
    const deps = fakes();
    const { resolved, manifest } = planned({ imageStore: { repository: "ghcr.io/acme/images" } });
    deps.runtimeDocker.failNext("push", new Error("denied"));

    await runManifest(manifest, resolved, deps);

    expect(await deps.runStore.listExecutions()).toMatchObject([{ status: "failed" }]);
  });

  test("asked to stop, it starts nothing more and records the execution as failed", async () => {
    const deps = fakes();
    const stopping = new AbortController();
    deps.runtimeDocker.onRun("-1-1", () => {
      stopping.abort();
      return crash();
    });
    const { resolved, manifest } = planned({ permutationCount: 3 });

    const records = await runManifest(manifest, resolved, { ...deps, signal: stopping.signal });

    expect(records).toHaveLength(1);
    expect(await deps.runStore.listExecutions()).toMatchObject([{ status: "failed" }]);
  });

  test("records the overrides given, if any", async () => {
    const deps = fakes();
    const { resolved, manifest } = planned({ overrides: { iterations: 1 } });

    await runManifest(manifest, resolved, deps);

    expect((await deps.runStore.listExecutions())[0]?.overrides).toEqual({ iterations: 1 });
  });
});
