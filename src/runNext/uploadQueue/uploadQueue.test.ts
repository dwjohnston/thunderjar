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
import { patchRun, updateRun } from "../../services/ApplicationState/ApplicationState.ts";
import { fakes } from "../testing/fixtures.ts";
import { createUploadQueue } from "./uploadQueue.ts";

/** A `push` a test finishes by hand. */
function manualPush() {
  const pushing = new Map<string, PromiseWithResolvers<void>>();
  return {
    docker: {
      push: (_image: string, reference: string) => {
        const push = Promise.withResolvers<void>();
        pushing.set(reference, push);
        return push.promise;
      },
    },
    pushing: () => [...pushing.keys()],
    finish: (reference: string) => pushing.get(reference)?.resolve(),
    fail: (reference: string, reason: string) => pushing.get(reference)?.reject(new Error(reason)),
  };
}

const image = (n: number) => ({ runId: `run-${n}`, image: `postrun:${n}`, reference: `store:postrun-${n}` });

describe(createUploadQueue, () => {
  test("pushes up to its concurrency at once, and the backlog counts those waiting and those being pushed", async () => {
    const deps = fakes();
    const { docker, pushing, finish } = manualPush();
    const queue = createUploadQueue(docker, deps, 2);

    for (const n of [1, 2, 3]) queue.enqueue(image(n));

    expect(pushing()).toEqual(["store:postrun-1", "store:postrun-2"]);
    expect(queue.backlog()).toBe(3);
    expect(deps.state.get().run.uploadBacklog).toBe(3);

    finish("store:postrun-1");
    await deps.clock.advance(0);
    expect(pushing()).toEqual(["store:postrun-1", "store:postrun-2", "store:postrun-3"]);
    expect(queue.backlog()).toBe(2);
  });

  test("drain resolves once every image is pushed", async () => {
    const deps = fakes();
    const { docker, finish } = manualPush();
    const queue = createUploadQueue(docker, deps, 1);
    queue.enqueue(image(1));
    let drained = false;
    void queue.drain().then(() => (drained = true));

    await deps.clock.advance(0);
    expect(drained).toBe(false);

    finish("store:postrun-1");
    await deps.clock.advance(0);
    expect(drained).toBe(true);
    expect(deps.state.get().run.uploadBacklog).toBe(0);
  });

  test("a committed run goes to uploading, then uploaded", async () => {
    const deps = fakes();
    deps.state.update(updateRun((run) => patchRun(run, "run-1", { status: "committed" })));
    const { docker, finish } = manualPush();
    const queue = createUploadQueue(docker, deps, 1);

    queue.enqueue(image(1));
    expect(deps.state.get().run.runs["run-1"]?.status).toBe("uploading");

    finish("store:postrun-1");
    await queue.drain();
    expect(deps.state.get().run.runs["run-1"]?.status).toBe("uploaded");
  });

  test("a run that crashed keeps that status while its image is pushed", async () => {
    const deps = fakes();
    deps.state.update(updateRun((run) => patchRun(run, "run-1", { status: "crashed" })));
    const { docker, finish } = manualPush();
    const queue = createUploadQueue(docker, deps, 1);

    queue.enqueue(image(1));
    finish("store:postrun-1");
    await queue.drain();

    expect(deps.state.history().map((state) => state.run.runs["run-1"]?.status)).not.toContain("uploading");
    expect(deps.state.get().run.runs["run-1"]?.status).toBe("crashed");
  });

  test("a push that fails is a failure, with why on its run, and drain still resolves", async () => {
    const deps = fakes();
    const { docker, fail } = manualPush();
    const queue = createUploadQueue(docker, deps, 1);
    queue.enqueue(image(1));

    fail("store:postrun-1", "denied");
    await queue.drain();

    expect(queue.failures()).toEqual([{ image: image(1), reason: "denied" }]);
    expect(deps.state.get().run.runs["run-1"]?.error).toBe("Its postrun image wasn't pushed to store:postrun-1: denied");
  });
});
