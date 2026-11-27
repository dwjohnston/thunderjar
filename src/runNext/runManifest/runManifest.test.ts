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
import type { Measurement } from "../../config/measurements.ts";
import { CANCELLED } from "../uploadQueue/uploadQueue.ts";
import { MEASURING_CANCELLED } from "../runPermutation/runPermutation.ts";
import { config, type Fakes, fakes } from "../testing/fixtures.ts";
import type { TestCaseConfig } from "../types.ts";
import { runManifest } from "./runManifest.ts";

const planned = (overrides: Partial<TestCaseConfig> & { permutationCount?: number } = {}) => {
  const resolved = config(overrides);
  return { resolved, manifest: plan(resolved, { concurrency: resolved.concurrency, executionId: "01exec" }) };
};

const crash = () => ({ files: { "/thunderjar/run.json": JSON.stringify({ startedAt: 1_700_000_000_000, finishedAt: 1_700_000_001_000, exitCode: 1 }) } });

/** A measurement taken in a container: a shell command that passes. */
const PASSES: Measurement = {
  name: "passes",
  declaration: { instrument: "shell", config: { command: "true" }, metrics: {} },
  config: { command: "true" },
  contentHash: "h",
};

/** Calls `then` as each run's measurement container opens. */
function onMeasuring(deps: Fakes, then: () => void) {
  const open = deps.runtimeDocker.openShellSession.bind(deps.runtimeDocker);
  deps.runtimeDocker.openShellSession = async (...args: Parameters<typeof deps.runtimeDocker.openShellSession>) => {
    then();
    return open(...args);
  };
}

/** An agent that runs until its container is removed. */
const hangs = () => new Promise<never>(() => {});

const STORE = { repository: "ghcr.io/acme/images" };

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

  test("records the overrides given, if any", async () => {
    const deps = fakes();
    const { resolved, manifest } = planned({ overrides: { iterations: 1 } });

    await runManifest(manifest, resolved, deps);

    expect((await deps.runStore.listExecutions())[0]?.overrides).toEqual({ iterations: 1 });
  });

  describe("Ctrl+C", () => {
    test("1st, while waiting for a slot: it never starts, and is recorded abandoned", async () => {
      const deps = fakes();
      deps.runtimeDocker.onRun("-1-1", () => {
        deps.interrupts.press();
        return hangs();
      });
      const { resolved, manifest } = planned({ permutationCount: 2 });

      const records = await runManifest(manifest, resolved, deps);

      expect(records.map(({ outcome }) => outcome)).toEqual(["abandoned", "abandoned"]);
      expect(deps.runtimeDocker.calls.filter((call) => call.startsWith("run "))).toHaveLength(1);
      expect((await deps.runStore.containerRunsOf("01exec")).map(({ iteration, permutation, execution }) => [permutation, iteration, execution.abandoned])).toEqual([
        [1, 1, "running"],
        [2, 1, "beforeStart"],
      ]);
      expect(deps.state.get().run.runs["01exec-xxxxxxxx-i1"]?.status).toBe("abandoned");
      expect(await deps.runStore.listExecutions()).toMatchObject([{ status: "failed" }]);
    });

    test("1st, while its agent runs: its container is removed, with no commit and no image", async () => {
      const deps = fakes();
      deps.runtimeDocker.onRun("-1-1", () => {
        deps.interrupts.press();
        return hangs();
      });
      const { resolved, manifest } = planned({ imageStore: STORE });

      const [record] = await runManifest(manifest, resolved, deps);

      expect(record).toMatchObject({ outcome: "abandoned", containerRun: { execution: { abandoned: "running", exitCode: null } } });
      expect(record?.postrunImage).toBeUndefined();
      expect(deps.runtimeDocker.calls.filter((call) => /^(commit|push) /.test(call))).toEqual([]);
      expect(deps.state.get().run.runs["01exec-oooooooo-i1"]?.status).toBe("abandoned");
    });

    test("1st, while measuring: it finishes, and its measures are saved", async () => {
      const deps = fakes();
      onMeasuring(deps, () => deps.interrupts.press());
      const { resolved, manifest } = planned({ measurements: [PASSES] });

      const [record] = await runManifest(manifest, resolved, deps);

      expect(record).toMatchObject({ outcome: "completed" });
      expect(record?.error).toBeUndefined();
      expect(Object.keys((await deps.runStore.containerRunsOf("01exec"))[0]?.result ?? {})).toEqual(["passes"]);
    });

    test("2nd, while measuring: its measurement containers are killed, and its measures aren't saved", async () => {
      const deps = fakes();
      onMeasuring(deps, () => {
        deps.interrupts.press();
        deps.interrupts.press();
      });
      const { resolved, manifest } = planned({ measurements: [PASSES] });

      const [record] = await runManifest(manifest, resolved, deps);

      expect(record).toMatchObject({ outcome: "completed", error: MEASURING_CANCELLED });
      expect(deps.runtimeDocker.calls).toContain("removeContainersNamed thunderjar-run-01exec-1-1-measure-");
      expect((await deps.runStore.containerRunsOf("01exec"))[0]?.result).toEqual({});
    });

    test("1st, while in the upload queue: it's uploaded", async () => {
      const deps = fakes();
      deps.runtimeDocker.onPush(() => deps.interrupts.press());
      const { resolved, manifest } = planned({ imageStore: STORE });

      await runManifest(manifest, resolved, deps);

      expect(deps.runtimeDocker.registry.has("ghcr.io/acme/images:postrun-e01exec-hoooooooo-i00")).toBe(true);
      expect(deps.state.get().run.runs["01exec-oooooooo-i1"]?.status).toBe("uploaded");
    });

    test("2nd, while in the upload queue: its push is cancelled", async () => {
      const deps = fakes();
      deps.runtimeDocker.onPush(() => {
        deps.interrupts.press();
        deps.interrupts.press();
        return hangs();
      });
      const { resolved, manifest } = planned({ imageStore: STORE });

      await runManifest(manifest, resolved, deps);

      expect(deps.runtimeDocker.registry.size).toBe(0);
      expect(deps.state.get().run.runs["01exec-oooooooo-i1"]?.error).toEndWith(CANCELLED);
      expect(await deps.runStore.listExecutions()).toMatchObject([{ status: "failed" }]);
    });

    test("SIGTERM, while its agent runs: abandoned, as for the 1st Ctrl+C", async () => {
      const deps = fakes();
      deps.runtimeDocker.onRun("-1-1", () => {
        deps.interrupts.terminate();
        return hangs();
      });
      const { resolved, manifest } = planned();

      const records = await runManifest(manifest, resolved, deps);

      expect(records.map(({ outcome }) => outcome)).toEqual(["abandoned"]);
    });
  });
});
