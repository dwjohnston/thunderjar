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
import { patchRun, updateRun } from "../../services/ApplicationState/ApplicationState.ts";
import { DockerContainerError } from "../../services/Docker/errors.ts";
import type { RecordedMeasure } from "../../store/runDataStore.ts";
import { RESULT_PATH, RUN_PATH, START_MARKER, STDERR_PATH, timedRun } from "../runScript.ts";
import { SECRET_SEARCH_PATH } from "../secretSearch.ts";
import { createRunControl, type RunControl } from "./runControl.ts";
import { runPermutation } from "./runPermutation.ts";
import { AN_IMAGE_STORE, aManifest, EXECUTION_ID, type FakeDependencies, fakeAgent, fakeDependencies, hashOf, START_TIME } from "./testSupport.ts";
import type { CommittedImage, Manifest, PlannedRun, UploadQueue } from "./types.ts";

// The first run of aManifest(): permutation 1 (`a`), iteration 1.
const PRERUN = "thunderjar-prerun:AAAAAAAA";
const CONTAINER = `thunderjar-run-${EXECUTION_ID}-1-1`;
const POSTRUN = `thunderjar-postrun:${EXECUTION_ID}-1-1`;
const RUN_ID = `${EXECUTION_ID}-aaaaaaaa-i1`;
const A_SECRET = "made-up-secret-value";

/** An upload queue that only keeps what it is given. */
function aQueue(onEnqueue: (image: CommittedImage) => void = () => {}): UploadQueue & { enqueued: CommittedImage[] } {
  const enqueued: CommittedImage[] = [];
  return {
    enqueued,
    enqueue: (image) => {
      enqueued.push(image);
      onEnqueue(image);
    },
    backlog: () => enqueued.length,
    drain: async () => {},
  };
}

/** Fakes whose runtime has the prerun image, with a result file left over in it, and runs `agent` in the run's container. */
function fakesWith(agent = fakeAgent(), env: Record<string, string> = {}): FakeDependencies {
  const fakes = fakeDependencies({ env: { variables: env } });
  fakes.runtimeDocker.addImage(PRERUN, { "/workspace/README.md": "hello" }).on("-1-1", agent);
  return fakes;
}

/** Runs the manifest's first run, moving the clock on `ms` so its agent can finish. */
async function runIt(
  fakes: FakeDependencies,
  { manifest = aManifest(), ms = 5_000, uploads = aQueue(), control }: { manifest?: Manifest; ms?: number; uploads?: ReturnType<typeof aQueue>; control?: RunControl } = {},
) {
  const running = runPermutation(manifest.runs[0] as PlannedRun, manifest, { ...fakes.deps, store: fakes.store }, uploads, control);
  await fakes.clock.advance(ms);
  return { record: await running, uploads, progress: fakes.state.get().run.runs[RUN_ID] };
}

/** Each status the run went through, in order. */
const statusesOf = (fakes: FakeDependencies) =>
  fakes.state
    .history()
    .map((state) => state.run.runs[RUN_ID]?.status)
    .filter((status, index, all) => status !== undefined && status !== all[index - 1]);

const measured = (data: unknown): RecordedMeasure => ({ instrument: "grep", contentHash: "c1", measuredAt: "2027-01-15T08:00:02.000Z", outcome: { outcome: "measured", data } });

describe("runPermutation: a clean run", () => {
  it("runs the timed run script in a container from the prerun image, on the runtime", async () => {
    const fakes = fakesWith();
    const manifest = aManifest({ env: { GREETING: "hello" }, secretEnv: ["NPM_TOKEN"] });

    await runIt(fakes, { manifest });

    expect(fakes.runtimeDocker.called("run")[0]).toEqual([
      PRERUN,
      CONTAINER,
      timedRun(),
      { env: ["ROBOT_KEY"], secretEnv: ["NPM_TOKEN"], setEnv: { GREETING: "hello" }, runOptions: ["--init"], timeoutSeconds: 60, startMarker: START_MARKER },
    ]);
    expect(fakes.hostDocker.calls).toEqual([]);
  });

  it("finishes, with what was recorded, and goes through each status on the way", async () => {
    const fakes = fakesWith();

    const { record } = await runIt(fakes);

    expect(record).toEqual({ runId: RUN_ID, status: "finished", record: fakes.store.containerRuns[0] });
    expect(statusesOf(fakes)).toEqual(["running", "committing", "committed", "measuring", "finished"]);
  });

  it("records every field of the container run", async () => {
    const fakes = fakesWith();

    await runIt(fakes);

    expect(fakes.store.containerRuns).toEqual([
      {
        executionId: EXECUTION_ID,
        testCase: "example",
        task: "greet",
        permutation: 1,
        permutationHash: hashOf("a"),
        iteration: 1,
        postrunImage: POSTRUN,
        ranAt: "2027-01-15T08:00:00.000Z",
        parameters: {
          baseImage: { name: "node", parameterHash: "pb" },
          codeState: { name: "empty", parameterHash: "pc" },
          promptSet: { name: "none", parameterHash: "pp" },
          harnessModel: { name: "robot/small", parameterHash: "ph" },
          initialPrompt: { name: "hello", parameterHash: "pi" },
        },
        harnessModel: { harness: "robot", version: "1.0.0", modelId: "small" },
        harnessEnv: ["ROBOT_KEY"],
        execution: { startedAt: START_TIME, finishedAt: START_TIME + 1_000, exitCode: 0, timedOut: false, timeoutSeconds: 60 },
        harnessResult: "done",
        harnessStderr: "",
        reply: { outcome: "collected", text: "done" },
        tokenCosts: { outcome: "unavailable", reason: "notReported" },
        result: {},
      },
    ]);
  });

  it("records the test case's env, the names of its secrets, and what each parameter resolved to, when there are any", async () => {
    const fakes = fakesWith();
    const manifest = aManifest({ env: { GREETING: "hello" }, secretEnv: ["NPM_TOKEN"] });
    (manifest.permutations[0] as Manifest["permutations"][number]).parameters[1] = { axis: "codeState", name: "empty", parameterHash: "pc", resolved: { commit: "abc123" } };

    await runIt(fakes, { manifest });

    const [recorded] = fakes.store.containerRuns;
    expect(recorded?.env).toEqual({ GREETING: "hello" });
    expect(recorded?.secretEnv).toEqual(["NPM_TOKEN"]);
    expect(recorded?.parameters.codeState).toEqual({ name: "empty", parameterHash: "pc", resolved: { commit: "abc123" } });
  });

  it("commits the container into its postrun image, like the prerun image, keeping the test case's env", async () => {
    const fakes = fakesWith();

    await runIt(fakes, { manifest: aManifest({ env: { GREETING: "hello" } }) });

    expect(fakes.runtimeDocker.called("commit")).toEqual([[CONTAINER, POSTRUN, PRERUN, { GREETING: "hello" }]]);
    expect(fakes.runtimeDocker.imageFiles(POSTRUN)).toMatchObject({ "/workspace/README.md": "hello", [RESULT_PATH]: "done" });
  });

  it("removes the container at the end", async () => {
    const fakes = fakesWith();

    await runIt(fakes);

    expect(fakes.runtimeDocker.removed).toEqual([CONTAINER]);
    expect(fakes.runtimeDocker.containers()).toEqual([]);
  });

  it("shows how it ended, and when it started and finished", async () => {
    const fakes = fakesWith(fakeAgent({ durationMs: 2_500 }));

    const { progress } = await runIt(fakes);

    expect(progress).toEqual({ status: "finished", outcome: "done", startedAt: START_TIME, finishedAt: START_TIME + 2_500 });
  });

  it("shows it as started as soon as it is running", async () => {
    const fakes = fakesWith(fakeAgent({ durationMs: 2_500 }));
    const manifest = aManifest();

    const running = runPermutation(manifest.runs[0] as PlannedRun, manifest, { ...fakes.deps, store: fakes.store }, aQueue());
    await fakes.clock.advance(1_000);

    expect(fakes.state.get().run.runs[RUN_ID]).toEqual({ status: "running", startedAt: START_TIME });
    await fakes.clock.advance(5_000);
    await running;
  });

  it("shows the cost and tokens its harness reported", async () => {
    const fakes = fakesWith();
    const tokenCosts = {
      outcome: "collected" as const,
      models: [{ model: "small", inputTokens: 100, outputTokens: 20, cacheCreationTokens: 3, cacheReadTokens: 7, costUsd: 0.25, costBasis: "list" as const }],
    };
    fakes.measurer.collects({ reply: { outcome: "collected", text: "hi" }, tokenCosts });

    const { progress } = await runIt(fakes);

    expect(progress).toMatchObject({ costUsd: 0.25, tokens: 130 });
    expect(fakes.store.containerRuns[0]).toMatchObject({ tokenCosts, reply: { outcome: "collected", text: "hi" } });
    expect(fakes.measurer.collected).toEqual([{ of: { root: "/project/.thunderjar", harness: { name: "robot", version: "1.0.0", modelId: "small" } }, harnessResult: "done" }]);
  });

  it("times the agent, collecting what it left, the commit and the measuring", async () => {
    const fakes = fakesWith(fakeAgent({ durationMs: 2_500 }));

    await runIt(fakes);

    expect(fakes.state.get().run.timings?.phases).toEqual({
      agent: { count: 1, totalMs: 2_500, maxMs: 2_500 },
      collect: { count: 1, totalMs: 0, maxMs: 0 },
      commit: { count: 1, totalMs: 0, maxMs: 0 },
      measure: { count: 1, totalMs: 0, maxMs: 0 },
    });
  });
});

describe("runPermutation: measuring", () => {
  it("measures the committed run, and records it again with its measures", async () => {
    const fakes = fakesWith();
    fakes.measurer.measures({ tests: measured({ passed: 4, failed: 1 }), polite: measured(true) });
    const manifest = aManifest({ secretEnv: ["NPM_TOKEN", "ROBOT_KEY"] });

    const { record, progress } = await runIt(fakes, { manifest });

    expect(fakes.measurer.measured).toEqual([
      {
        // The variables the agent was given by name, each once: its postrun image has them blank.
        of: { root: "/project/.thunderjar", task: "greet", postrunImage: POSTRUN, container: CONTAINER, secretEnv: ["ROBOT_KEY", "NPM_TOKEN"] },
        recorded: { harnessResult: "done", reply: { outcome: "collected", text: "done" } },
      },
    ]);
    expect(fakes.store.writes).toEqual([`recordContainerRun ${EXECUTION_ID} 1-1`, `recordContainerRun ${EXECUTION_ID} 1-1`]);
    expect(fakes.store.containerRuns[0]?.result).toEqual({ tests: measured({ passed: 4, failed: 1 }), polite: measured(true) });
    expect(record.record?.result).toEqual(fakes.store.containerRuns[0]?.result);
    expect(progress?.measures).toEqual({ tests: "{passed: 4, failed: 1}", polite: "true" });
  });

  it("shows a measure that was skipped, or errored, with why", async () => {
    const fakes = fakesWith();
    fakes.measurer.measures({
      lint: { ...measured(0), outcome: { outcome: "skipped", reason: "no linter" } },
      bare: { ...measured(0), outcome: { outcome: "skipped" } },
      tests: { ...measured(0), outcome: { outcome: "erroredWhileMeasuring", error: { message: "bun not found" } } },
    });

    const { progress } = await runIt(fakes);

    expect(progress?.measures).toEqual({ lint: "skipped (no linter)", bare: "skipped", tests: "erroredWhileMeasuring (bun not found)" });
  });

  it("records a run once when its task has no measurements", async () => {
    const fakes = fakesWith();

    const { progress } = await runIt(fakes);

    expect(fakes.store.writes).toEqual([`recordContainerRun ${EXECUTION_ID} 1-1`]);
    expect(progress?.measures).toBeUndefined();
  });

  it("is crashed if measuring fails, but keeps the run it had already recorded", async () => {
    const fakes = fakesWith();
    fakes.measurer.failMeasure("the measurement container didn't start");

    const { record, progress } = await runIt(fakes);

    expect(record).toEqual({ runId: RUN_ID, status: "crashed", error: "the measurement container didn't start", record: fakes.store.containerRuns[0] });
    expect(fakes.store.containerRuns[0]?.result).toEqual({});
    expect(progress).toMatchObject({ status: "crashed", error: "the measurement container didn't start" });
    expect(fakes.runtimeDocker.removed).toEqual([CONTAINER]);
  });
});

describe("runPermutation: an agent that doesn't end well", () => {
  it("records a non-zero exit as a result: finished, committed and measured", async () => {
    const fakes = fakesWith(fakeAgent({ exitCode: 2, stderr: "warming up\nout of credit\n" }));

    const { record, progress } = await runIt(fakes);

    expect(record.status).toBe("finished");
    expect(record.record?.execution).toEqual({ startedAt: START_TIME, finishedAt: START_TIME + 1_000, exitCode: 2, timedOut: false, timeoutSeconds: 60 });
    expect(record.record?.harnessStderr).toBe("warming up\nout of credit\n");
    expect(fakes.runtimeDocker.images()).toContain(POSTRUN);
    expect(fakes.measurer.measured).toHaveLength(1);
    expect(progress).toMatchObject({ status: "finished", outcome: "exited 2", hint: "out of credit" });
  });

  it("says when an agent left no result file", async () => {
    const fakes = fakesWith(fakeAgent({ result: null }));

    const { record, progress } = await runIt(fakes);

    expect(record.record?.harnessResult).toBeNull();
    expect(record.record?.reply).toEqual({ outcome: "unavailable", reason: "the agent left no result file" });
    expect(progress?.outcome).toBe("done, no result file");
  });

  it("kills an agent that runs past its timeout, and still commits, records and measures it", async () => {
    const fakes = fakesWith(fakeAgent({ durationMs: 120_000 }));

    const { record, progress } = await runIt(fakes, { ms: 61_000 });

    expect(record.status).toBe("timedOut");
    expect(record.record?.execution).toEqual({ startedAt: START_TIME, finishedAt: START_TIME + 60_000, exitCode: null, timedOut: true, timeoutSeconds: 60 });
    expect(record.record?.harnessResult).toBeNull();
    expect(fakes.runtimeDocker.imageFiles(POSTRUN)).toEqual({ "/workspace/README.md": "hello", [RUN_PATH]: `{"startedAt":${START_TIME}}\n` });
    expect(fakes.measurer.measured).toHaveLength(1);
    expect(statusesOf(fakes)).toEqual(["running", "committing", "committed", "measuring", "timedOut"]);
    expect(progress).toMatchObject({ status: "timedOut", outcome: "timed out after 60s", startedAt: START_TIME, finishedAt: START_TIME + 60_000 });
    expect(fakes.runtimeDocker.removed).toEqual([CONTAINER]);
  });

  it("records a container that never started as crashed, with why, and commits nothing", async () => {
    const fakes = fakeDependencies();
    const uploads = aQueue();

    const { record, progress } = await runIt(fakes, { uploads, manifest: aManifest({}, { imageStore: AN_IMAGE_STORE }) });

    expect(record.status).toBe("crashed");
    expect(record.error).toBe(`No such image: ${PRERUN}`);
    expect(record.record).toEqual(fakes.store.containerRuns[0]);
    expect(record.record).toMatchObject({
      execution: { startedAt: START_TIME, finishedAt: START_TIME, exitCode: null, timedOut: false, timeoutSeconds: 60, failedToStart: `No such image: ${PRERUN}` },
      harnessResult: null,
      harnessStderr: null,
      reply: { outcome: "unavailable", reason: "the agent left no result file" },
      result: {},
    });
    expect(fakes.runtimeDocker.called("commit")).toEqual([]);
    expect(fakes.measurer.measured).toEqual([]);
    expect(uploads.enqueued).toEqual([]);
    expect(statusesOf(fakes)).toEqual(["running", "crashed"]);
    expect(progress).toMatchObject({ status: "crashed", outcome: "failed to start", error: `No such image: ${PRERUN}`, hint: `No such image: ${PRERUN}` });
  });
});

describe("runPermutation never throws", () => {
  it("is crashed, with Docker's reason, if Docker fails mid-way, and still removes the container", async () => {
    const fakes = fakesWith();
    fakes.runtimeDocker.failOn("commit", new DockerContainerError("no space left on device"));

    const { record, progress } = await runIt(fakes);

    expect(record).toEqual({ runId: RUN_ID, status: "crashed", error: "no space left on device" });
    expect(fakes.store.containerRuns).toEqual([]);
    expect(statusesOf(fakes)).toEqual(["running", "committing", "crashed"]);
    expect(progress).toMatchObject({ status: "crashed", error: "no space left on device", startedAt: START_TIME, finishedAt: START_TIME + 1_000 });
    expect(fakes.runtimeDocker.removed).toEqual([CONTAINER]);
  });

  it("is crashed if `docker run` itself fails", async () => {
    const fakes = fakeDependencies();
    fakes.runtimeDocker.addImage(PRERUN).on("-1-1", async ({ start }) => {
      start();
      return { exitCode: 125, stderr: "the daemon went away" };
    });

    const { record } = await runIt(fakes);

    expect(record).toEqual({ runId: RUN_ID, status: "crashed", error: "the daemon went away" });
  });

  it("is crashed if the run script left no valid record of how it ran", async () => {
    const fakes = fakeDependencies();
    fakes.runtimeDocker.addImage(PRERUN);

    const { record } = await runIt(fakes);

    expect(record.status).toBe("crashed");
    expect(record.error).toContain(`The run script left no valid ${RUN_PATH}`);
    expect(fakes.runtimeDocker.called("commit")).toEqual([]);
  });

  it("is crashed if it can't be recorded", async () => {
    const fakes = fakesWith();
    fakes.store.failWith("the disk is full");

    const { record } = await runIt(fakes);

    expect(record.status).toBe("crashed");
    expect(record.error).toContain("the disk is full");
    // Nothing was stored, so the record says nothing was.
    expect(record.record).toBeUndefined();
    expect(fakes.runtimeDocker.removed).toEqual([CONTAINER]);
  });

  it("keeps the record as it was stored, if its measures can't be recorded", async () => {
    const fakes = fakesWith();
    fakes.measurer.measures({ polite: measured(true) });
    const measure = fakes.measurer.measure.bind(fakes.measurer);
    fakes.measurer.measure = (...given) => {
      fakes.store.failWith("the disk is full");
      return measure(...given);
    };

    const { record } = await runIt(fakes);

    expect(record.status).toBe("crashed");
    expect(record.record?.result).toEqual({});
    expect(record.record).toEqual(fakes.store.containerRuns[0]);
  });

  it("is crashed if what the agent left can't be collected", async () => {
    const fakes = fakesWith();
    fakes.measurer.failCollect("the harness's index.ts is missing");

    const { record } = await runIt(fakes);

    expect(record).toEqual({ runId: RUN_ID, status: "crashed", error: "the harness's index.ts is missing" });
  });

  it("is crashed, without touching Docker, for a run of a permutation the manifest doesn't have", async () => {
    const fakes = fakesWith();
    const manifest = aManifest();
    const stray = { ...(manifest.runs[0] as PlannedRun), permutationHash: hashOf("z") };

    const record = await runPermutation(stray, manifest, { ...fakes.deps, store: fakes.store }, aQueue());

    expect(record.status).toBe("crashed");
    expect(record.error).toContain("zzzzzzzz");
    expect(fakes.runtimeDocker.called("run")).toEqual([]);
  });

  it("doesn't throw if the container can't be removed either", async () => {
    const fakes = fakesWith();
    fakes.runtimeDocker.failOn("removeContainer", new DockerContainerError("the daemon went away"));

    const { record } = await runIt(fakes);

    expect(record.status).toBe("finished");
  });
});

describe("runPermutation: asked to stop", () => {
  it("is crashed, and commits and records nothing, if its container was removed while its agent ran", async () => {
    const fakes = fakesWith(fakeAgent({ durationMs: 60_000 }));
    const control = createRunControl();

    const running = runPermutation(aManifest().runs[0] as PlannedRun, aManifest(), { ...fakes.deps, store: fakes.store }, aQueue(), control);
    await fakes.clock.advance(2_000);
    control.stop();
    await fakes.runtimeDocker.removeContainersNamed(CONTAINER);
    await fakes.clock.advance(1_000);
    const record = await running;

    expect(record).toEqual({ runId: RUN_ID, status: "crashed", error: "Stopped before it ended." });
    expect(fakes.runtimeDocker.called("commit")).toEqual([]);
    expect(fakes.store.containerRuns).toEqual([]);
    expect(fakes.state.get().run.runs[RUN_ID]?.status).toBe("crashed");
  });

  it("goes no further once its agent ends, even if its container outlived the stop", async () => {
    const fakes = fakesWith(fakeAgent({ durationMs: 3_000 }));
    const control = createRunControl();

    const running = runPermutation(aManifest().runs[0] as PlannedRun, aManifest(), { ...fakes.deps, store: fakes.store }, aQueue(), control);
    await fakes.clock.advance(1_000);
    control.stop();
    await fakes.clock.advance(5_000);

    expect((await running).status).toBe("crashed");
    expect(fakes.runtimeDocker.called("commit")).toEqual([]);
    expect(fakes.runtimeDocker.removed).toEqual([CONTAINER]);
  });

  it("starts no secret search and takes no measurements, if asked while it was committed", async () => {
    const fakes = fakesWith(fakeAgent(), { ROBOT_KEY: A_SECRET });
    const control = createRunControl();
    const commit = fakes.runtimeDocker.commit.bind(fakes.runtimeDocker);
    fakes.runtimeDocker.commit = (...given) => {
      control.stop();
      return commit(...given);
    };

    const { record } = await runIt(fakes, { control });

    expect(record.status).toBe("crashed");
    expect(fakes.runtimeDocker.called("run").length).toBe(1);
    expect(fakes.measurer.measured).toEqual([]);
    expect(fakes.store.containerRuns).toEqual([]);
  });

  it("takes no measurements if asked once it was recorded, and keeps what was recorded", async () => {
    const fakes = fakesWith();
    const control = createRunControl();
    const uploads = aQueue(() => control.stop());

    const { record } = await runIt(fakes, { manifest: aManifest({}, { imageStore: AN_IMAGE_STORE }), uploads, control });

    expect(record.status).toBe("crashed");
    expect(record.record).toEqual(fakes.store.containerRuns[0]);
    expect(fakes.measurer.measured).toEqual([]);
  });
});

describe("runPermutation: the postrun image and the image store", () => {
  it("hands the committed image to the upload queue, and pushes nothing itself", async () => {
    const fakes = fakesWith();
    const stored = `registry.example/acme/images:postrun-e${EXECUTION_ID}-haaaaaaaa-i00`;

    const { uploads, record } = await runIt(fakes, { manifest: aManifest({}, { imageStore: AN_IMAGE_STORE }) });

    expect(uploads.enqueued).toEqual([{ runId: RUN_ID, image: POSTRUN, reference: stored }]);
    expect(fakes.runtimeDocker.called("push")).toEqual([]);
    expect(fakes.registry.references()).toEqual([]);
    // Recorded under where the store keeps it: the local name lives only on the runtime.
    expect(record.record?.postrunImage).toBe(stored);
  });

  it("enqueues it only once it is recorded, and before it is measured", async () => {
    const fakes = fakesWith();
    const seen: string[] = [];
    const uploads = aQueue(() => seen.push(`writes: ${fakes.store.writes.length}, measured: ${fakes.measurer.measured.length}`));

    await runIt(fakes, { uploads, manifest: aManifest({}, { imageStore: AN_IMAGE_STORE }) });

    expect(seen).toEqual(["writes: 1, measured: 0"]);
  });

  it("enqueues nothing with no image store", async () => {
    const fakes = fakesWith();

    const { uploads } = await runIt(fakes);

    expect(uploads.enqueued).toEqual([]);
  });

  it("leaves a run shown as uploaded that way, if its upload finished before its measures", async () => {
    const fakes = fakesWith();
    const uploads = aQueue(() => fakes.state.update(updateRun((run) => patchRun(run, RUN_ID, { status: "uploaded" }))));
    // The measurer is asked while the run shows `measuring`; the upload ends during it.
    const measure = fakes.measurer.measure.bind(fakes.measurer);
    fakes.measurer.measure = async (of, recorded) => {
      fakes.state.update(updateRun((run) => patchRun(run, RUN_ID, { status: "uploaded" })));
      return measure(of, recorded);
    };

    const { progress } = await runIt(fakes, { uploads, manifest: aManifest({}, { imageStore: AN_IMAGE_STORE }) });

    expect(progress).toMatchObject({ status: "uploaded", outcome: "done" });
  });
});

describe("runPermutation: searching the postrun image for secrets", () => {
  it("searches for the values of the variables the agent was given by name, and records what was found", async () => {
    const fakes = fakesWith(fakeAgent(), { ROBOT_KEY: A_SECRET, NPM_TOKEN: A_SECRET, SHORT: "short" });
    fakes.runtimeDocker.on("-secrets", async ({ start, write }) => {
      start();
      write(SECRET_SEARCH_PATH, "ROBOT_KEY\t/workspace/.env\ncomplete\n");
      return 0;
    });

    const { record } = await runIt(fakes, { manifest: aManifest({ secretEnv: ["NPM_TOKEN", "SHORT"] }) });

    const search = fakes.runtimeDocker.called("run")[1] as [string, string, string, { env: string[] }];
    expect(search.slice(0, 2)).toEqual([POSTRUN, `${CONTAINER}-secrets`]);
    // By name only: a value is never in a command.
    expect(search[3].env).toEqual(["ROBOT_KEY", "NPM_TOKEN"]);
    expect(JSON.stringify(fakes.runtimeDocker.calls)).not.toContain(A_SECRET);
    expect(record.record?.secretsFound).toEqual([{ name: "ROBOT_KEY", files: 1, paths: ["/workspace/.env"] }]);
    expect(fakes.runtimeDocker.removed).toEqual([`${CONTAINER}-secrets`, CONTAINER]);
    expect(fakes.state.get().run.timings?.phases.secretSearch?.count).toBe(1);
  });

  it("records why, if the search couldn't be done, and goes on", async () => {
    const fakes = fakesWith(fakeAgent(), { ROBOT_KEY: A_SECRET });

    const { record } = await runIt(fakes);

    expect(record.status).toBe("finished");
    expect(record.record?.secretSearchFailed).toBe("the search left no results");
    expect(record.record?.secretsFound).toBeUndefined();
  });

  it("searches for nothing when no variable holds a value worth searching for", async () => {
    const fakes = fakesWith(fakeAgent(), { ROBOT_KEY: "short" });

    const { record } = await runIt(fakes);

    expect(fakes.runtimeDocker.called("run")).toHaveLength(1);
    expect(record.record?.secretSearchFailed).toBeUndefined();
    expect(fakes.state.get().run.timings?.phases.secretSearch).toBeUndefined();
  });
});

describe("the fake agent", () => {
  it("leaves what the timed run leaves: its result, its stderr and how it ran", async () => {
    const fakes = fakeDependencies();
    fakes.runtimeDocker.addImage("box").on("agent", fakeAgent({ exitCode: 3, result: "{}", stderr: "oops", durationMs: 400 }));

    const running = fakes.runtimeDocker.run("box", "an-agent", "", { startMarker: START_MARKER });
    await fakes.clock.advance(400);

    expect(await running).toEqual({ outcome: "exited" });
    expect(fakes.runtimeDocker.container("an-agent")?.files).toEqual({
      [RUN_PATH]: `{"startedAt":${START_TIME},"finishedAt":${START_TIME + 400},"exitCode":3}\n`,
      [RESULT_PATH]: "{}",
      [STDERR_PATH]: "oops",
    });
  });
});
