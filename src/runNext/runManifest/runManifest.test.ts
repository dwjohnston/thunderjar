/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-fable-5-2
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { describe, expect, test } from "bun:test";
import { DockerContainerError, DockerPushError } from "../../docker/docker.ts";
import { RunDataStoreError } from "../../services/RunDataStore/RunDataStore.ts";
import { changeRunDetails } from "../state/state.ts";
import {
  agentNeverStarted,
  agentRan,
  agentTimedOut,
  type FakeDependencies,
  fakeDependencies,
  fakeManifest,
  IMAGE_STORE,
  loggedSteps,
  RUN_STORE_LOCATION,
  seedManifest,
  START,
} from "../testing/fakeDependencies.ts";
import type { Manifest } from "../types.ts";
import { runManifest } from "./runManifest.ts";

const STORED = (iteration: number) => `registry.example.com/team/images:postrun-eexec-haaaaaaaa-i0${iteration - 1}`;

/** Dependencies with the manifest of `config` in the state, and every agent exiting 0 unless scripted otherwise. */
function setUp(config: Parameters<typeof fakeManifest>[0] = {}, settings: Parameters<typeof fakeManifest>[1] = {}): { deps: FakeDependencies; manifest: Manifest; recordedStatuses: string[] } {
  const deps = fakeDependencies();
  const manifest = fakeManifest(config, settings);
  seedManifest(deps, manifest);
  // The store keeps only an execution's latest record: this keeps each status it was recorded with.
  const recordedStatuses: string[] = [];
  const recordExecution = deps.runStore.recordExecution.bind(deps.runStore);
  deps.runStore.recordExecution = async (record) => {
    recordedStatuses.push(record.status);
    await recordExecution(record);
  };
  return { deps, manifest, recordedStatuses };
}

const execution = (deps: FakeDependencies) => deps.runStore.executions.get("exec");
const statuses = (deps: FakeDependencies) => Object.fromEntries(Object.entries(deps.state.get().run.runs).map(([runId, { status }]) => [runId, status]));

describe(runManifest, () => {
  describe("every agent exits 0", () => {
    test("returns a record per run, in the manifest's order", async () => {
      const { deps, manifest } = setUp({ permutations: ["a", "b"], iterations: 2 });
      deps.runtimeDocker.on("", agentRan());

      const records = await runManifest(manifest, deps);

      expect(records.map(({ runId, outcome, exitCode }) => ({ runId, outcome, exitCode }))).toEqual([
        { runId: "exec-1-1", outcome: "completed", exitCode: 0 },
        { runId: "exec-1-2", outcome: "completed", exitCode: 0 },
        { runId: "exec-2-1", outcome: "completed", exitCode: 0 },
        { runId: "exec-2-2", outcome: "completed", exitCode: 0 },
      ]);
    });

    test("records the execution as running, then as complete", async () => {
      const { deps, manifest, recordedStatuses } = setUp();
      deps.runtimeDocker.on("", agentRan());

      await runManifest(manifest, deps);

      expect(recordedStatuses).toEqual(["running", "complete"]);
    });

    test("the execution is recorded as running before the first container starts", async () => {
      const { deps, manifest } = setUp();
      let statusAtFirstRun: string | undefined;
      deps.runtimeDocker.on("", () => {
        statusAtFirstRun = execution(deps)?.status;
        return agentRan();
      });

      await runManifest(manifest, deps);

      expect(statusAtFirstRun).toBe("running");
    });

    test("records what the execution was, and when it started and finished", async () => {
      const { deps, manifest } = setUp({ permutations: ["a", "b"], iterations: 2 });
      deps.runtimeDocker.on("", { ...agentRan(), ms: 1_000 });

      const running = runManifest(manifest, deps);
      await deps.clock.advance(4_000);
      await running;

      expect(execution(deps)).toEqual({
        executionId: "exec",
        testCase: "greeting",
        task: "greet",
        startedAt: new Date(START).toISOString(),
        finishedAt: new Date(START + 4_000).toISOString(),
        status: "complete",
        matrix: { shape: [1, 1, 1, 2, 1], permutations: 2, iterations: 2 },
      });
    });

    test("records each container run", async () => {
      const { deps, manifest } = setUp({ iterations: 2 });
      deps.runtimeDocker.on("", agentRan());

      await runManifest(manifest, deps);

      expect([...deps.runStore.containerRuns.values()].map(({ permutation, iteration }) => `${permutation}-${iteration}`)).toEqual(["1-1", "1-2"]);
    });

    test("sets details.finished: the execution, where it's recorded, its container runs and its timings", async () => {
      const { deps, manifest } = setUp({ iterations: 2 });
      deps.runtimeDocker.on("", { ...agentRan(), ms: 1_000 });

      const running = runManifest(manifest, deps);
      await deps.clock.advance(2_000);
      await running;

      const finished = deps.state.get().run.details?.finished;
      expect(finished?.execution).toEqual(execution(deps)!);
      expect(finished?.recordedIn).toBe(RUN_STORE_LOCATION);
      expect(finished?.containerRuns.map(({ iteration }) => iteration)).toEqual([1, 2]);
      expect(finished?.timings.wallMs).toBe(2_000);
      expect(finished?.timings.phases.agent).toEqual({ count: 2, totalMs: 2_000, maxMs: 1_000 });
    });

    test("every run is queued before any starts, and ends committed", async () => {
      const { deps, manifest } = setUp({ iterations: 2 });
      let atFirstRun: Record<string, string> | undefined;
      deps.runtimeDocker.on("", () => {
        atFirstRun ??= statuses(deps);
        return agentRan();
      });

      await runManifest(manifest, deps);

      expect(atFirstRun).toEqual({ "exec-1-1": "running", "exec-1-2": "queued" });
      expect(statuses(deps)).toEqual({ "exec-1-1": "committed", "exec-1-2": "committed" });
    });

    test("without an image store, pushes nothing", async () => {
      const { deps, manifest } = setUp();
      deps.runtimeDocker.on("", agentRan());

      await runManifest(manifest, deps);

      expect(deps.runtimeDocker.callsOf("push")).toEqual([]);
    });

    test("runs at most `concurrency` containers at once", async () => {
      const { deps, manifest } = setUp({ permutations: ["a", "b", "c"] }, { concurrency: 2 });
      deps.runtimeDocker.on("", { ...agentRan(), ms: 1_000 });

      const running = runManifest(manifest, deps);
      await deps.clock.advance(0);
      expect(deps.runtimeDocker.callsOf("run")).toHaveLength(2);

      await deps.clock.advance(1_000);
      expect(deps.runtimeDocker.callsOf("run")).toHaveLength(3);

      await deps.clock.advance(1_000);
      expect(await running).toHaveLength(3);
    });
  });

  describe("the execution is recorded as failed", () => {
    test("when an agent exits non-zero", async () => {
      const { deps, manifest, recordedStatuses } = setUp({ iterations: 2 });
      deps.runtimeDocker.on("", agentRan()).on("exec-1-2", agentRan({ exitCode: 1 }));

      const records = await runManifest(manifest, deps);

      expect(records.map(({ exitCode }) => exitCode)).toEqual([0, 1]);
      expect(recordedStatuses).toEqual(["running", "failed"]);
      expect(deps.state.get().run.details?.finished?.execution.status).toBe("failed");
    });

    test("when a run times out", async () => {
      const { deps, manifest } = setUp();
      deps.runtimeDocker.on("", agentTimedOut());

      const records = await runManifest(manifest, deps);

      expect(records.map(({ outcome }) => outcome)).toEqual(["timedOut"]);
      expect(execution(deps)?.status).toBe("failed");
    });

    test("when a run crashes: the rest still run", async () => {
      const { deps, manifest } = setUp({ iterations: 3 });
      deps.runtimeDocker.on("", agentRan()).on("exec-1-2", agentNeverStarted());

      const records = await runManifest(manifest, deps);

      expect(records.map(({ outcome }) => outcome)).toEqual(["completed", "crashed", "completed"]);
      expect(statuses(deps)).toEqual({ "exec-1-1": "committed", "exec-1-2": "crashed", "exec-1-3": "committed" });
      expect(execution(deps)?.status).toBe("failed");
    });

    test("when Docker throws in a run: it doesn't throw", async () => {
      const { deps, manifest } = setUp({ iterations: 2 });
      deps.runtimeDocker.on("", agentRan()).fail("run", new DockerContainerError("daemon went away"), "exec-1-1");

      const records = await runManifest(manifest, deps);

      expect(records.map(({ outcome }) => outcome)).toEqual(["crashed", "completed"]);
      expect(execution(deps)?.status).toBe("failed");
    });

    test("after a crash, removes any container of the execution left behind", async () => {
      const { deps, manifest } = setUp();
      deps.runtimeDocker.on("", agentNeverStarted());

      await runManifest(manifest, deps);

      expect(deps.runtimeDocker.callsOf("removeContainersNamed")).toEqual(["tj-run-exec-"]);
    });

    test("with no crash, doesn't look for containers left behind", async () => {
      const { deps, manifest } = setUp();
      deps.runtimeDocker.on("", agentRan());

      await runManifest(manifest, deps);

      expect(deps.runtimeDocker.callsOf("removeContainersNamed")).toEqual([]);
    });
  });

  describe("with an image store", () => {
    test("waits for every post-run image to upload before the execution is complete", async () => {
      const { deps, manifest } = setUp({ imageStore: IMAGE_STORE, iterations: 2 });
      deps.runtimeDocker.on("", agentRan());

      await runManifest(manifest, deps);

      expect(deps.runtimeDocker.callsOf("push")).toEqual([`tj-postrun:exec-1-1 ${STORED(1)}`, `tj-postrun:exec-1-2 ${STORED(2)}`]);
      expect(deps.runtimeDocker.registry).toEqual(new Set([STORED(1), STORED(2)]));
      expect(execution(deps)?.status).toBe("complete");
    });

    test("every run ends uploaded, with nothing left waiting", async () => {
      const { deps, manifest } = setUp({ imageStore: IMAGE_STORE, iterations: 2 });
      deps.runtimeDocker.on("", agentRan());

      await runManifest(manifest, deps);

      expect(statuses(deps)).toEqual({ "exec-1-1": "uploaded", "exec-1-2": "uploaded" });
      expect(deps.state.get().run.uploadBacklog).toBe(0);
    });

    test("logs each upload as it starts and ends", async () => {
      const { deps, manifest } = setUp({ imageStore: IMAGE_STORE });
      deps.runtimeDocker.on("", agentRan());

      await runManifest(manifest, deps);

      expect(loggedSteps(deps)).toContain("exec-1-1:uploading");
      expect(loggedSteps(deps)).toContain("exec-1-1:uploaded");
      expect(deps.state.get().run.details?.finished?.timings.phases.pushPostrun?.count).toBe(1);
    });

    test("records where each post-run image is kept", async () => {
      const { deps, manifest } = setUp({ imageStore: IMAGE_STORE });
      deps.runtimeDocker.on("", agentRan());

      const records = await runManifest(manifest, deps);

      expect(records[0]?.postrunImage).toBe(STORED(1));
      expect(deps.state.get().run.details?.finished?.containerRuns[0]?.postrunImage).toBe(STORED(1));
    });

    describe("a failed push", () => {
      const denied = new DockerPushError("denied", STORED(1));

      test("is rethrown, once the execution is recorded as failed", async () => {
        const { deps, manifest, recordedStatuses } = setUp({ imageStore: IMAGE_STORE });
        deps.runtimeDocker.on("", agentRan()).fail("push", denied);

        await expect(runManifest(manifest, deps)).rejects.toBe(denied);

        expect(recordedStatuses).toEqual(["running", "failed"]);
        expect(execution(deps)?.finishedAt).toBe(new Date(START).toISOString());
      });

      test("leaves the run committed: its image is still in the runtime", async () => {
        const { deps, manifest } = setUp({ imageStore: IMAGE_STORE });
        deps.runtimeDocker.on("", agentRan()).fail("push", denied);

        await runManifest(manifest, deps).catch(() => {});

        expect(statuses(deps)).toEqual({ "exec-1-1": "committed" });
        expect(loggedSteps(deps)).toContain("exec-1-1:uploadFailed");
        expect(deps.state.get().run.uploadBacklog).toBe(0);
      });

      test("the other images still upload", async () => {
        const { deps, manifest } = setUp({ imageStore: IMAGE_STORE, iterations: 2 });
        deps.runtimeDocker.on("", agentRan()).fail("push", denied, STORED(1));

        await runManifest(manifest, deps).catch(() => {});

        expect(statuses(deps)).toEqual({ "exec-1-1": "committed", "exec-1-2": "uploaded" });
      });
    });
  });

  describe("asked to stop", () => {
    /** The first container asks the execution to stop while it runs, as Ctrl-C does through `runCommand`. */
    const stopDuringFirstRun = (deps: FakeDependencies) =>
      deps.runtimeDocker.on("", () => {
        changeRunDetails(deps, (details) => ({ ...details, stopRequested: "SIGINT" }));
        return agentRan();
      });

    test("no more runs start", async () => {
      const { deps, manifest } = setUp({ iterations: 3 });
      stopDuringFirstRun(deps);

      const records = await runManifest(manifest, deps);

      expect(deps.runtimeDocker.callsOf("run")).toHaveLength(1);
      expect(records.map(({ runId }) => runId)).toEqual(["exec-1-1"]);
      expect(statuses(deps)).toEqual({ "exec-1-1": "committed", "exec-1-2": "queued", "exec-1-3": "queued" });
    });

    test("the execution is recorded as failed, even if the runs that ran exited 0", async () => {
      const { deps, manifest, recordedStatuses } = setUp({ iterations: 3 });
      stopDuringFirstRun(deps);

      await runManifest(manifest, deps);

      expect(recordedStatuses).toEqual(["running", "failed"]);
      expect(deps.state.get().run.details?.finished?.execution.status).toBe("failed");
    });

    test("asked before anything ran: nothing runs", async () => {
      const { deps, manifest } = setUp();
      changeRunDetails(deps, (details) => ({ ...details, stopRequested: "SIGTERM" }));

      const records = await runManifest(manifest, deps);

      expect(records).toEqual([]);
      expect(deps.runtimeDocker.callsOf("run")).toEqual([]);
      expect(execution(deps)?.status).toBe("failed");
    });
  });

  describe("the run data store", () => {
    test("that can't record the execution: throws, and nothing runs", async () => {
      const { deps, manifest } = setUp();
      deps.runStore.failure = new RunDataStoreError(RUN_STORE_LOCATION, "disk full");

      await expect(runManifest(manifest, deps)).rejects.toBeInstanceOf(RunDataStoreError);

      expect(deps.runtimeDocker.calls).toEqual([]);
    });
  });
});
