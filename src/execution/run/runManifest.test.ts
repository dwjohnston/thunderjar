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
import { RunDataStoreError } from "../../store/runDataStore.ts";
import { SECRET_SEARCH_PATH } from "../secretSearch.ts";
import { EXPOSED } from "./render.ts";
import { runManifest } from "./runManifest.ts";
import { AN_IMAGE_STORE, aManifest, EXECUTION_ID, type FakeDependencies, fakeAgent, fakeDependencies, START_TIME } from "./testSupport.ts";
import type { ExecutionResult, Manifest } from "./types.ts";

// aManifest(): permutations `a` and `b`, two iterations each, one container at a time.
const PRERUN_A = "thunderjar-prerun:AAAAAAAA";
const PRERUN_B = "thunderjar-prerun:BBBBBBBB";
const RUN = {
  a1: `${EXECUTION_ID}-aaaaaaaa-i1`,
  a2: `${EXECUTION_ID}-aaaaaaaa-i2`,
  b1: `${EXECUTION_ID}-bbbbbbbb-i1`,
  b2: `${EXECUTION_ID}-bbbbbbbb-i2`,
};
const CONTAINERS = `thunderjar-run-${EXECUTION_ID}-`;

/** Fakes whose runtime has both prerun images, and runs `agent` in every container. */
function fakesWith(agent = fakeAgent(), env: Parameters<typeof fakeDependencies>[0] = {}): FakeDependencies {
  const fakes = fakeDependencies(env);
  fakes.runtimeDocker.addImage(PRERUN_A).addImage(PRERUN_B).on("", agent);
  return fakes;
}

/** Runs the manifest, moving the clock on `ms` so its agents, warm-ups and uploads can finish. */
async function runIt(fakes: FakeDependencies, manifest: Manifest = aManifest(), { ms = 120_000, shouldStop }: { ms?: number; shouldStop?: () => boolean } = {}): Promise<ExecutionResult> {
  const running = runManifest(manifest, fakes.deps, shouldStop === undefined ? {} : { shouldStop });
  // Seen as handled, should it fail before the clock has moved.
  running.catch(() => {});
  await fakes.clock.advance(ms);
  return running;
}

const statusesOf = (fakes: FakeDependencies) => Object.fromEntries(Object.entries(fakes.state.get().run.runs).map(([runId, { status }]) => [runId, status]));

/** The most runs that were `running` at once. */
const mostAtOnce = (fakes: FakeDependencies) =>
  Math.max(...fakes.state.history().map((state) => Object.values(state.run.runs).filter(({ status }) => status === "running").length));

describe("runManifest: a full run", () => {
  it("runs every run and returns what was recorded", async () => {
    const fakes = fakesWith();

    const result = await runIt(fakes);

    expect(result.runs.map(({ runId, status }) => [runId, status])).toEqual([
      [RUN.a1, "finished"],
      [RUN.a2, "finished"],
      [RUN.b1, "finished"],
      [RUN.b2, "finished"],
    ]);
    expect(result.containerRuns.map(({ permutation, iteration }) => `${permutation}-${iteration}`)).toEqual(["1-1", "1-2", "2-1", "2-2"]);
    expect(result.containerRuns).toEqual(fakes.store.containerRuns);
    expect(result.recordedIn).toBe("memory");
    expect(statusesOf(fakes)).toEqual({ [RUN.a1]: "finished", [RUN.a2]: "finished", [RUN.b1]: "finished", [RUN.b2]: "finished" });
  });

  it("records the execution as running before any run starts, then as complete", async () => {
    const fakes = fakesWith();

    const result = await runIt(fakes);

    expect(fakes.store.writes[0]).toBe(`recordExecution ${EXECUTION_ID}`);
    expect(fakes.store.writes.at(-1)).toBe(`recordExecution ${EXECUTION_ID}`);
    expect(result.execution).toEqual({
      executionId: EXECUTION_ID,
      testCase: "example",
      task: "greet",
      startedAt: new Date(START_TIME).toISOString(),
      finishedAt: new Date(START_TIME + 4_000).toISOString(),
      status: "complete",
      matrix: { shape: [1, 1, 1, 1, 2], permutations: 2, iterations: 2 },
    });
    expect(fakes.store.executions).toEqual([result.execution]);
  });

  it("opens the store the manifest names, and says where it recorded", async () => {
    const fakes = fakesWith();

    await runIt(fakes, aManifest({ dataDir: "elsewhere" }));

    expect(fakes.stores.opened).toEqual(["elsewhere"]);
    expect(fakes.state.get().run.recordedIn).toBe("memory");
  });

  it("shows every run as queued before the first one starts", async () => {
    const fakes = fakesWith();

    await runIt(fakes);

    const allQueued = fakes.state.history().some((state) => Object.keys(state.run.runs).length === 4 && Object.values(state.run.runs).every(({ status }) => status === "queued"));
    expect(allQueued).toBe(true);
  });

  it("runs on the runtime only, never more at once than the manifest's concurrency", async () => {
    const one = fakesWith(fakeAgent({ durationMs: 10_000 }));
    await runIt(one, aManifest({ concurrency: 1 }));
    expect(mostAtOnce(one)).toBe(1);
    expect(one.hostDocker.calls).toEqual([]);

    const two = fakesWith(fakeAgent({ durationMs: 10_000 }));
    await runIt(two, aManifest({ concurrency: 2 }));
    expect(mostAtOnce(two)).toBe(2);
  });

  it("gives a permutation's first run five seconds before its others start", async () => {
    const fakes = fakesWith(fakeAgent({ durationMs: 10_000 }));

    await runIt(fakes, aManifest({ concurrency: 4 }));

    const startedAt = (runId: string) => (fakes.state.get().run.runs[runId]?.startedAt ?? 0) - START_TIME;
    expect([startedAt(RUN.a1), startedAt(RUN.a2), startedAt(RUN.b1), startedAt(RUN.b2)]).toEqual([0, 5_000, 0, 5_000]);
  });

  it("records the overrides given with the execution", async () => {
    const fakes = fakesWith();

    const result = await runIt(fakes, aManifest({ overrides: { iterations: 2 } }));

    expect(result.execution.overrides).toEqual({ iterations: 2 });
  });
});

describe("runManifest: runs that go wrong", () => {
  it("is failed if an agent exits non-zero, and still runs the rest", async () => {
    const fakes = fakeDependencies();
    fakes.runtimeDocker.addImage(PRERUN_A).addImage(PRERUN_B).on("-1-2", fakeAgent({ exitCode: 2, stderr: "out of credit" })).on("", fakeAgent());

    const result = await runIt(fakes);

    expect(result.execution.status).toBe("failed");
    expect(result.runs.map(({ status }) => status)).toEqual(["finished", "finished", "finished", "finished"]);
    expect(result.containerRuns.map(({ execution }) => execution.exitCode)).toEqual([0, 2, 0, 0]);
    expect(fakes.state.get().run.notes).toEqual(["1 of 4 agents didn't end cleanly:", "  1×  exited 2  out of credit  (1-2)"]);
  });

  it("is failed if an agent times out", async () => {
    const fakes = fakeDependencies();
    fakes.runtimeDocker.addImage(PRERUN_A).addImage(PRERUN_B).on("-2-1", fakeAgent({ durationMs: 100_000 })).on("", fakeAgent());

    const result = await runIt(fakes, aManifest(), { ms: 300_000 });

    expect(result.execution.status).toBe("failed");
    expect(statusesOf(fakes)[RUN.b1]).toBe("timedOut");
  });

  it("is failed if a container never starts, and then removes whatever containers the execution left", async () => {
    const fakes = fakeDependencies();
    // Permutation b's image is missing.
    fakes.runtimeDocker.addImage(PRERUN_A).on("", fakeAgent());

    const result = await runIt(fakes);

    expect(result.execution.status).toBe("failed");
    expect(result.runs.map(({ status }) => status)).toEqual(["finished", "finished", "crashed", "crashed"]);
    expect(fakes.runtimeDocker.called("removeContainersNamed")).toEqual([[CONTAINERS]]);
    expect(fakes.state.get().run.notes?.[0]).toBe("2 of 4 agents didn't end cleanly:");
  });

  it("doesn't sweep containers after a clean execution", async () => {
    const fakes = fakesWith();

    await runIt(fakes);

    expect(fakes.runtimeDocker.called("removeContainersNamed")).toEqual([]);
  });

  it("notes the secrets found in postrun images, and the images that couldn't be searched", async () => {
    const fakes = fakeDependencies({ env: { variables: { ROBOT_KEY: "made-up-secret-value" } } });
    fakes.runtimeDocker
      .addImage(PRERUN_A)
      .addImage(PRERUN_B)
      .on("-1-1-secrets", async ({ start, write }) => {
        start();
        write(SECRET_SEARCH_PATH, "ROBOT_KEY\t/workspace/.env\ncomplete\n");
        return 0;
      })
      // The others' searches leave nothing.
      .on("-secrets", async () => 0)
      .on("", fakeAgent());

    await runIt(fakes);

    expect(fakes.state.get().run.notes).toEqual([
      "1 of 4 postrun images hold a secret's value in their files:",
      "  1-1  ROBOT_KEY  1 file: /workspace/.env",
      EXPOSED,
      "Couldn't search 3 of 4 postrun images for secrets' values, so they may hold one:",
      "  1-2  the search left no results",
      "  2-1  the search left no results",
      "  2-2  the search left no results",
    ]);
    expect(JSON.stringify(fakes.state.get())).not.toContain("made-up-secret-value");
  });

  it("says why a run crashed before it was recorded", async () => {
    const fakes = fakesWith();
    fakes.measurer.collects(() => {
      throw new Error("the harness's collector broke");
    });

    const result = await runIt(fakes);

    expect(result.runs.every(({ status }) => status === "crashed")).toBe(true);
    expect(fakes.state.get().run.notes).toEqual(["4 of 4 agents didn't end cleanly:", "  4×  crashed  the harness's collector broke  (1-1, 1-2, 2-1, 2-2)"]);
    expect(result.execution.status).toBe("failed");
  });

  it("stops before anything runs if the store can't be used", async () => {
    const fakes = fakesWith();
    fakes.store.failCheckWith("no such table");

    const error = await runIt(fakes).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RunDataStoreError);
    expect(fakes.runtimeDocker.calls).toEqual([]);
    expect(fakes.store.executions).toEqual([]);
  });
});

describe("runManifest: uploads", () => {
  const stored = () => aManifest({}, { imageStore: AN_IMAGE_STORE });

  it("pushes every postrun image to the image store, from the runtime, before it returns", async () => {
    const fakes = fakesWith();
    const manifest = stored();

    const result = await runIt(fakes, manifest);

    for (const run of manifest.runs) expect(fakes.registry.has(run.storedPostrunImage as string)).toBe(true);
    expect(fakes.runtimeDocker.called("push").length).toBe(4);
    expect(fakes.hostDocker.calls).toEqual([]);
    expect(result.execution.status).toBe("complete");
    expect(statusesOf(fakes)).toEqual({ [RUN.a1]: "uploaded", [RUN.a2]: "uploaded", [RUN.b1]: "uploaded", [RUN.b2]: "uploaded" });
    expect(fakes.state.get().run.uploadBacklog).toBe(0);
    expect(fakes.state.get().run.timings?.phases.pushPostrun?.count).toBe(4);
  });

  it("shows the backlog while images wait to upload", async () => {
    const fakes = fakesWith();
    fakes.runtimeDocker.takes("push", 20_000);

    await runIt(fakes, stored());

    expect(Math.max(...fakes.state.history().map((state) => state.run.uploadBacklog))).toBeGreaterThan(1);
  });

  it("holds new runs back while more images wait to upload than the cap", async () => {
    const fakes = fakesWith(fakeAgent(), { env: { uploadBacklogCap: 0 } });
    fakes.runtimeDocker.takes("push", 30_000);

    await runIt(fakes, stored(), { ms: 300_000 });

    // The first run takes a second, then its image thirty to push: only then does the second start.
    const second = fakes.state.get().run.runs[RUN.a2]?.startedAt ?? 0;
    expect(second - START_TIME).toBeGreaterThanOrEqual(31_000);
    expect(second - START_TIME).toBeLessThan(33_000);
  });

  it("is failed if a postrun image can't be pushed, and says so, but the run itself finished", async () => {
    const fakes = fakesWith();
    const manifest = stored();
    const reference = manifest.runs[0]?.storedPostrunImage as string;
    fakes.runtimeDocker.failPush(reference, "denied");

    const result = await runIt(fakes, manifest);

    expect(result.execution.status).toBe("failed");
    expect(statusesOf(fakes)[RUN.a1]).toBe("finished");
    expect(fakes.state.get().run.notes).toEqual([`Pushing ${reference} failed: denied`]);
  });
});

describe("runManifest: asked to stop", () => {
  it("starts no new run, cancels the rest, records the execution as failed and removes its containers", async () => {
    const fakes = fakesWith();
    // Stops once the first run has finished.
    const shouldStop = () => fakes.state.get().run.runs[RUN.a1]?.status === "finished";

    const result = await runIt(fakes, aManifest(), { shouldStop });

    expect(result.runs.map(({ status }) => status)).toEqual(["finished", "cancelled", "cancelled", "cancelled"]);
    expect(statusesOf(fakes)).toEqual({ [RUN.a1]: "finished", [RUN.a2]: "cancelled", [RUN.b1]: "cancelled", [RUN.b2]: "cancelled" });
    expect(result.execution.status).toBe("failed");
    expect(fakes.runtimeDocker.called("run").length).toBe(1);
    expect(fakes.runtimeDocker.called("removeContainersNamed")).toEqual([[CONTAINERS]]);
  });
});
