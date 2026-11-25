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
import type { Measurement } from "../../config/measurements.ts";
import { DockerContainerError } from "../../docker/docker.ts";
import { START_MARKER } from "../../execution/runScript.ts";
import { SECRET_SEARCH_PATH } from "../../execution/secretSearch.ts";
import { RunDataStoreError } from "../../services/RunDataStore/RunDataStore.ts";
import {
  agentNeverStarted,
  agentRan,
  agentTimedOut,
  type FakeDependencies,
  fakeDependencies,
  fakeManifest,
  fakePermutation,
  IMAGE_STORE,
  loggedSteps,
  replyMeasurement,
  seedManifest,
  START,
} from "../testing/fakeDependencies.ts";
import type { CommittedImage, Manifest, PlannedRun } from "../types.ts";
import type { UploadQueue } from "../uploadQueue/uploadQueue.ts";
import { runPermutation } from "./runPermutation.ts";

const RUN_ID = "exec-1-1";
const CONTAINER = "tj-run-exec-1-1";
const PRERUN = "tj-prerun:aaaaaaaa";
const POSTRUN = "tj-postrun:exec-1-1";
const STORED_POSTRUN = "registry.example.com/team/images:postrun-eexec-haaaaaaaa-i00";

/** An upload queue that pushes nothing, and keeps what it was handed. */
function fakeUploads(): UploadQueue & { enqueued: CommittedImage[] } {
  const enqueued: CommittedImage[] = [];
  return { enqueued, enqueue: (image) => void enqueued.push(image), backlog: () => enqueued.length, drain: async () => {} };
}

/** The state seeded with the manifest of `config`, as `runPermutation` reads it from there, and its first run. */
function setUp(config: Parameters<typeof fakeManifest>[0] = {}): { deps: FakeDependencies; manifest: Manifest; run: PlannedRun; uploads: ReturnType<typeof fakeUploads> } {
  const deps = fakeDependencies();
  const manifest = fakeManifest(config);
  seedManifest(deps, manifest);
  return { deps, manifest, run: manifest.runs[0] as PlannedRun, uploads: fakeUploads() };
}

const statusOf = (deps: FakeDependencies) => deps.state.get().run.runs[RUN_ID]?.status;
const recorded = (deps: FakeDependencies) => [...deps.runStore.containerRuns.values()];

describe(runPermutation, () => {
  describe("an agent that exits 0", () => {
    test("returns a completed record", async () => {
      const { deps, run, uploads } = setUp();
      deps.runtimeDocker.on(CONTAINER, { ...agentRan(), ms: 1_000 });

      const running = runPermutation(run, deps, uploads);
      await deps.clock.advance(1_000);

      expect(await running).toEqual({ runId: RUN_ID, outcome: "completed", startedAt: START, finishedAt: START + 1_000, exitCode: 0, postrunImage: POSTRUN });
    });

    test("starts the container from the permutation's image, with its variables and time limit", async () => {
      const permutation = { ...fakePermutation("a"), env: ["API_KEY"], runOptions: ["--memory", "1g"], timeoutSeconds: 90 };
      const { deps, run, uploads } = setUp({ permutations: [permutation], testCaseEnv: { COLOUR: "blue" }, secretEnv: ["PASSWORD"] });
      deps.runtimeDocker.on(CONTAINER, agentRan());

      await runPermutation(run, deps, uploads);

      expect(deps.runtimeDocker.runs[0]).toMatchObject({
        image: PRERUN,
        name: CONTAINER,
        options: { env: ["API_KEY"], runOptions: ["--memory", "1g"], setEnv: { COLOUR: "blue" }, secretEnv: ["PASSWORD"], timeoutSeconds: 90, startMarker: START_MARKER },
      });
    });

    test("commits the container into the post-run image, with the pre-run image's config", async () => {
      const { deps, run, uploads } = setUp();
      deps.runtimeDocker.on(CONTAINER, agentRan());

      await runPermutation(run, deps, uploads);

      expect(deps.runtimeDocker.callsOf("commit")).toEqual([`${CONTAINER} ${POSTRUN} ${PRERUN}`]);
      expect(deps.runtimeDocker.images.has(POSTRUN)).toBe(true);
    });

    test("records the run in the store, as it ran", async () => {
      const { deps, run, uploads } = setUp();
      deps.runtimeDocker.on(CONTAINER, agentRan({ result: "hello", stderr: "a warning" }));

      await runPermutation(run, deps, uploads);

      expect(recorded(deps)).toHaveLength(1);
      expect(recorded(deps)[0]).toMatchObject({
        executionId: "exec",
        testCase: "greeting",
        task: "greet",
        permutation: 1,
        permutationHash: "aaaaaaaaaaaaaaaa",
        iteration: 1,
        postrunImage: POSTRUN,
        ranAt: new Date(START).toISOString(),
        harnessModel: { harness: "echo", version: "1.0.0", modelId: "model-a" },
        execution: { startedAt: START, finishedAt: START + 1_000, exitCode: 0, timedOut: false, timeoutSeconds: 60 },
        harnessResult: "hello",
        harnessStderr: "a warning",
        reply: { outcome: "collected", text: "hello" },
        result: {},
      });
      expect(recorded(deps)[0]?.parameters.codeState).toEqual({ name: "code", parameterHash: "h-code" });
    });

    test("ends committed, having been running and committing", async () => {
      const { deps, run, uploads } = setUp();
      deps.runtimeDocker.on(CONTAINER, agentRan());

      await runPermutation(run, deps, uploads);

      const statuses = deps.state.history().flatMap((state) => state.run.runs[RUN_ID]?.status ?? []);
      expect(statuses.filter((status, i) => status !== statuses[i - 1])).toEqual(["running", "committing", "committed"]);
    });

    test("logs that it started, ran and is done", async () => {
      const { deps, run, uploads } = setUp();
      deps.runtimeDocker.on(CONTAINER, agentRan());

      await runPermutation(run, deps, uploads);

      expect(loggedSteps(deps)).toEqual([`${RUN_ID}:started`, `${RUN_ID}:ran`, `${RUN_ID}:done`]);
    });

    test("removes the container", async () => {
      const { deps, run, uploads } = setUp();
      deps.runtimeDocker.on(CONTAINER, agentRan());

      await runPermutation(run, deps, uploads);

      expect(deps.runtimeDocker.callsOf("removeContainer")).toEqual([CONTAINER]);
      expect(deps.runtimeDocker.containers.size).toBe(0);
    });

    test("records the test case's variables, and the names of its secret ones", async () => {
      const { deps, run, uploads } = setUp({ testCaseEnv: { COLOUR: "blue" }, secretEnv: ["PASSWORD"] });
      deps.runtimeDocker.on(CONTAINER, agentRan());

      await runPermutation(run, deps, uploads);

      expect(recorded(deps)[0]).toMatchObject({ env: { COLOUR: "blue" }, secretEnv: ["PASSWORD"] });
    });
  });

  describe("an agent that exits non-zero", () => {
    test("is completed, with its exit code, and committed and recorded all the same", async () => {
      const { deps, run, uploads } = setUp();
      deps.runtimeDocker.on(CONTAINER, agentRan({ exitCode: 2 }));

      const record = await runPermutation(run, deps, uploads);

      expect(record).toMatchObject({ outcome: "completed", exitCode: 2, postrunImage: POSTRUN });
      expect(statusOf(deps)).toBe("committed");
      expect(deps.runtimeDocker.callsOf("commit")).toHaveLength(1);
      expect(recorded(deps)[0]?.execution.exitCode).toBe(2);
    });
  });

  describe("measurements", () => {
    test("are taken once the run is committed, and recorded with it", async () => {
      const { deps, run, uploads } = setUp({ measurements: [replyMeasurement("saysHello", "hello"), replyMeasurement("saysBye", "bye")] });
      deps.runtimeDocker.on(CONTAINER, agentRan({ result: "hello there" }));

      const record = await runPermutation(run, deps, uploads);

      expect(record.outcome).toBe("completed");
      expect(recorded(deps)).toHaveLength(1);
      expect(recorded(deps)[0]?.result.saysHello).toMatchObject({ instrument: "replyMatches", contentHash: "hash-of-saysHello", outcome: { outcome: "measured", data: true } });
      expect(recorded(deps)[0]?.result.saysBye?.outcome).toEqual({ outcome: "measured", data: false });
      expect(loggedSteps(deps)).toEqual([`${RUN_ID}:started`, `${RUN_ID}:ran`, `${RUN_ID}:measuring`, `${RUN_ID}:measured`, `${RUN_ID}:done`]);
    });

    test("dates each measure by the clock", async () => {
      const { deps, run, uploads } = setUp({ measurements: [replyMeasurement("saysHello", "hello")] });
      deps.runtimeDocker.on(CONTAINER, { ...agentRan(), ms: 5_000 });

      const running = runPermutation(run, deps, uploads);
      await deps.clock.advance(5_000);
      await running;

      expect(recorded(deps)[0]?.result.saysHello?.measuredAt).toBe(new Date(START + 5_000).toISOString());
    });

    test("a measurement container that can't be opened crashes the run, which stays recorded as it ran", async () => {
      const inContainer = { name: "madeFile", declaration: { instrument: "fileCreated", config: { path: "hello.txt" }, metrics: {} }, config: { path: "hello.txt" }, contentHash: "hash" } as unknown as Measurement;
      const { deps, run, uploads } = setUp({ measurements: [inContainer] });
      deps.runtimeDocker.on(CONTAINER, agentRan());
      deps.runtimeDocker.fail("openShellSession", new DockerContainerError("no such image"));

      const record = await runPermutation(run, deps, uploads);

      expect(record).toMatchObject({ outcome: "crashed", exitCode: null, reason: "Measuring failed: no such image" });
      expect(statusOf(deps)).toBe("crashed");
      expect(recorded(deps)).toHaveLength(1);
      expect(recorded(deps)[0]?.execution.exitCode).toBe(0);
      expect(loggedSteps(deps)).toContain(`${RUN_ID}:measureFailed`);
    });
  });

  describe("an agent that times out", () => {
    const measured = { measurements: [replyMeasurement("saysHello", "hello")] };

    test("returns a timed out record, with no exit code", async () => {
      const { deps, run, uploads } = setUp(measured);
      deps.runtimeDocker.on(CONTAINER, agentTimedOut());

      const record = await runPermutation(run, deps, uploads);

      expect(record).toMatchObject({ runId: RUN_ID, outcome: "timedOut", exitCode: null, postrunImage: POSTRUN });
    });

    test("is committed, and recorded as killed when it was", async () => {
      const { deps, run, uploads } = setUp(measured);
      deps.runtimeDocker.on(CONTAINER, agentTimedOut());

      await runPermutation(run, deps, uploads);

      expect(deps.runtimeDocker.callsOf("commit")).toEqual([`${CONTAINER} ${POSTRUN} ${PRERUN}`]);
      expect(recorded(deps)[0]?.execution).toEqual({ startedAt: START, finishedAt: START + 60_000, exitCode: null, timedOut: true, timeoutSeconds: 60 });
    });

    test("isn't measured", async () => {
      const { deps, run, uploads } = setUp(measured);
      deps.runtimeDocker.on(CONTAINER, agentTimedOut());

      await runPermutation(run, deps, uploads);

      expect(recorded(deps)[0]?.result).toEqual({});
      expect(loggedSteps(deps)).toEqual([`${RUN_ID}:started`, `${RUN_ID}:ran`, `${RUN_ID}:done`]);
    });

    test("removes the container", async () => {
      const { deps, run, uploads } = setUp(measured);
      deps.runtimeDocker.on(CONTAINER, agentTimedOut());

      await runPermutation(run, deps, uploads);

      expect(deps.runtimeDocker.containers.size).toBe(0);
    });

    // Fails today: a timed out run ends `committed`, like one that finished. Nothing ever sets the
    // `timedOut` status, though `RunStatus` has it and the architecture plan's example checks for it.
    test.todo("ends with the status timedOut", async () => {
      const { deps, run, uploads } = setUp(measured);
      deps.runtimeDocker.on(CONTAINER, agentTimedOut());

      await runPermutation(run, deps, uploads);

      expect(statusOf(deps)).toBe("timedOut");
    });
  });

  describe("a container that never starts", () => {
    test("returns a crashed record, with why", async () => {
      const { deps, run, uploads } = setUp();
      deps.runtimeDocker.on(CONTAINER, agentNeverStarted("no space left on device"));

      const record = await runPermutation(run, deps, uploads);

      expect(record).toEqual({ runId: RUN_ID, outcome: "crashed", startedAt: START, finishedAt: START, exitCode: null, reason: "no space left on device" });
      expect(statusOf(deps)).toBe("crashed");
    });

    test("is recorded with failedToStart, from when docker run started to when it was given up on", async () => {
      const { deps, run, uploads } = setUp();
      deps.runtimeDocker.on(CONTAINER, agentNeverStarted("no space left on device"));

      await runPermutation(run, deps, uploads);

      expect(recorded(deps)).toHaveLength(1);
      expect(recorded(deps)[0]).toMatchObject({
        execution: { startedAt: START, finishedAt: START + 5_000, exitCode: null, timedOut: false, timeoutSeconds: 60, failedToStart: "no space left on device" },
        harnessResult: null,
        harnessStderr: null,
        result: {},
      });
    });

    test("is neither committed nor measured, and its container is removed in case it was made late", async () => {
      const { deps, run, uploads } = setUp({ measurements: [replyMeasurement("saysHello", "hello")] });
      deps.runtimeDocker.on(CONTAINER, agentNeverStarted());

      await runPermutation(run, deps, uploads);

      expect(deps.runtimeDocker.callsOf("commit")).toEqual([]);
      expect(deps.runtimeDocker.callsOf("removeContainer")).toEqual([CONTAINER]);
      expect(loggedSteps(deps)).toEqual([`${RUN_ID}:started`, `${RUN_ID}:ran`, `${RUN_ID}:done`]);
    });
  });

  describe("Docker failing mid-run", () => {
    test("docker run throwing is a crashed run, not a throw", async () => {
      const { deps, run, uploads } = setUp();
      deps.runtimeDocker.fail("run", new DockerContainerError("daemon went away"));

      const record = await runPermutation(run, deps, uploads);

      expect(record).toMatchObject({ runId: RUN_ID, outcome: "crashed", exitCode: null, reason: "daemon went away" });
      expect(statusOf(deps)).toBe("crashed");
      expect(loggedSteps(deps)).toEqual([`${RUN_ID}:started`, `${RUN_ID}:ran`, `${RUN_ID}:done`]);
    });

    test("the commit throwing is a crashed run, recorded with why, and the container is removed", async () => {
      const { deps, run, uploads } = setUp();
      deps.runtimeDocker.on(CONTAINER, agentRan());
      deps.runtimeDocker.fail("commit", new DockerContainerError("no space left on device"));

      const record = await runPermutation(run, deps, uploads);

      expect(record).toMatchObject({ outcome: "crashed", reason: "no space left on device" });
      expect(record).not.toHaveProperty("postrunImage");
      expect(recorded(deps)[0]?.execution).toMatchObject({ exitCode: null, failedToStart: "no space left on device" });
      expect(deps.runtimeDocker.containers.size).toBe(0);
    });

    test("a container that left no run.json is a crashed run", async () => {
      const { deps, run, uploads } = setUp();
      deps.runtimeDocker.on(CONTAINER, { files: {} });

      const record = await runPermutation(run, deps, uploads);

      expect(record.outcome).toBe("crashed");
      expect(record.reason).toContain("/thunderjar/run.json");
      expect(deps.runtimeDocker.callsOf("commit")).toEqual([]);
      expect(deps.runtimeDocker.containers.size).toBe(0);
    });

    test("removing the container failing doesn't fail the run", async () => {
      const { deps, run, uploads } = setUp();
      deps.runtimeDocker.on(CONTAINER, agentRan());
      deps.runtimeDocker.fail("removeContainer", new DockerContainerError("daemon went away"));

      const record = await runPermutation(run, deps, uploads);

      expect(record.outcome).toBe("completed");
    });

    test("nothing is handed to the upload queue", async () => {
      const { deps, run, uploads } = setUp({ imageStore: IMAGE_STORE });
      deps.runtimeDocker.fail("run", new DockerContainerError("daemon went away"));

      await runPermutation(run, deps, uploads);

      expect(uploads.enqueued).toEqual([]);
    });
  });

  describe("the run data store failing", () => {
    test("is a crashed run, not a throw", async () => {
      const { deps, run, uploads } = setUp();
      deps.runtimeDocker.on(CONTAINER, agentRan());
      deps.runStore.failure = new RunDataStoreError("/data/runs.sqlite", "disk full");

      const record = await runPermutation(run, deps, uploads);

      expect(record).toMatchObject({ outcome: "crashed", reason: "disk full" });
      expect(statusOf(deps)).toBe("crashed");
    });
  });

  describe("uploads", () => {
    test("with an image store, hands the committed image to the upload queue, and records where it's kept", async () => {
      const { deps, run, uploads } = setUp({ imageStore: IMAGE_STORE });
      deps.runtimeDocker.on(CONTAINER, agentRan());

      const record = await runPermutation(run, deps, uploads);

      expect(uploads.enqueued).toEqual([{ runId: RUN_ID, image: POSTRUN, reference: STORED_POSTRUN }]);
      expect(record.postrunImage).toBe(STORED_POSTRUN);
      expect(recorded(deps)[0]?.postrunImage).toBe(STORED_POSTRUN);
    });

    test("doesn't push it itself", async () => {
      const { deps, run, uploads } = setUp({ imageStore: IMAGE_STORE });
      deps.runtimeDocker.on(CONTAINER, agentRan());

      await runPermutation(run, deps, uploads);

      expect(deps.runtimeDocker.callsOf("push")).toEqual([]);
    });

    test("a timed out run's image is uploaded too", async () => {
      const { deps, run, uploads } = setUp({ imageStore: IMAGE_STORE });
      deps.runtimeDocker.on(CONTAINER, agentTimedOut());

      await runPermutation(run, deps, uploads);

      expect(uploads.enqueued.map(({ reference }) => reference)).toEqual([STORED_POSTRUN]);
    });

    test("without an image store, enqueues nothing", async () => {
      const { deps, run, uploads } = setUp();
      deps.runtimeDocker.on(CONTAINER, agentRan());

      await runPermutation(run, deps, uploads);

      expect(uploads.enqueued).toEqual([]);
    });
  });

  describe("secrets", () => {
    const withKey = { permutations: [{ ...fakePermutation("a"), env: ["API_KEY"] }] };
    const SEARCH = `${CONTAINER}-secrets`;

    test("no container searches for them when the agent was given none", async () => {
      const { deps, run, uploads } = setUp();
      deps.runtimeDocker.on(CONTAINER, agentRan());

      await runPermutation(run, deps, uploads);

      expect(deps.runtimeDocker.runs.map(({ name }) => name)).toEqual([CONTAINER]);
    });

    test("searches the post-run image for the values of the variables the agent was given, with no network", async () => {
      const { deps, run, uploads } = setUp(withKey);
      deps.env.variables.API_KEY = "a-long-secret-value";
      deps.runtimeDocker.on(CONTAINER, agentRan()).on(SEARCH, { files: { [SECRET_SEARCH_PATH]: "API_KEY\t/workspace/.env\ncomplete\n" } });

      const record = await runPermutation(run, deps, uploads);

      expect(deps.runtimeDocker.runs[1]).toMatchObject({ image: POSTRUN, name: SEARCH, options: { env: ["API_KEY"], runOptions: ["--user", "0", "--network", "none"] } });
      expect(record.outcome).toBe("completed");
      expect(recorded(deps)[0]?.secretsFound).toEqual([{ name: "API_KEY", files: 1, paths: ["/workspace/.env"] }]);
      expect(deps.runtimeDocker.containers.size).toBe(0);
    });

    test("a search that leaves no results is recorded as failed, and the run goes on", async () => {
      const { deps, run, uploads } = setUp(withKey);
      deps.env.variables.API_KEY = "a-long-secret-value";
      deps.runtimeDocker.on(CONTAINER, agentRan());

      const record = await runPermutation(run, deps, uploads);

      expect(record.outcome).toBe("completed");
      expect(recorded(deps)[0]?.secretSearchFailed).toBe("the search left no results");
      expect(recorded(deps)[0]).not.toHaveProperty("secretsFound");
    });
  });
});
