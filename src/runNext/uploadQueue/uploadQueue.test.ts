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

import { peek } from "bun";
import { describe, expect, test } from "bun:test";
import { FakeClock } from "../../services/Clock/FakeClock.ts";
import type { CommittedImage } from "../types.ts";
import { createUploadQueue, type UploadEvent } from "./uploadQueue.ts";

const image = (name: string): CommittedImage => ({ runId: name, image: `local/${name}`, reference: `remote/${name}` });

/** A `push` that waits until the test finishes or fails it, by image name. */
function fakePush() {
  const pending = new Map<string, PromiseWithResolvers<void>>();
  const calls: [string, string][] = [];
  return {
    calls,
    push: (local: string, reference: string) => {
      calls.push([local, reference]);
      const push = Promise.withResolvers<void>();
      pending.set(local.replace("local/", ""), push);
      return push.promise;
    },
    finish: (name: string) => pending.get(name)?.resolve(),
    fail: (name: string, error: unknown) => pending.get(name)?.reject(error),
  };
}

/** Lets pending promise callbacks run. */
const settle = () => new FakeClock().advance(0);

describe(createUploadQueue, () => {
  test("pushes each image to its reference, in the order enqueued, at most `concurrency` at once", async () => {
    const docker = fakePush();
    const queue = createUploadQueue(docker, { concurrency: 2 });

    for (const name of ["a", "b", "c", "d"]) queue.enqueue(image(name));
    expect(docker.calls).toEqual([["local/a", "remote/a"], ["local/b", "remote/b"]]);

    docker.finish("b");
    await settle();
    expect(docker.calls.map(([local]) => local)).toEqual(["local/a", "local/b", "local/c"]);

    docker.finish("a");
    await settle();
    expect(docker.calls.map(([local]) => local)).toEqual(["local/a", "local/b", "local/c", "local/d"]);
  });

  test("pushes two at once by default", () => {
    const docker = fakePush();
    const queue = createUploadQueue(docker);

    for (const name of ["a", "b", "c"]) queue.enqueue(image(name));

    expect(docker.calls).toHaveLength(2);
  });

  test("backlog counts the images queued or being pushed", async () => {
    const docker = fakePush();
    const queue = createUploadQueue(docker, { concurrency: 1 });
    expect(queue.backlog()).toBe(0);

    queue.enqueue(image("a"));
    queue.enqueue(image("b"));
    expect(queue.backlog()).toBe(2);

    docker.finish("a");
    await settle();
    expect(queue.backlog()).toBe(1);

    docker.fail("b", new Error("no space"));
    await settle();
    expect(queue.backlog()).toBe(0);
  });

  describe("drain", () => {
    test("with nothing enqueued, resolves at once", async () => {
      const queue = createUploadQueue(fakePush());

      const drained = queue.drain();
      await settle();

      expect(peek.status(drained)).toBe("fulfilled");
    });

    test("waits for every image, including ones enqueued while it waits", async () => {
      const docker = fakePush();
      const queue = createUploadQueue(docker, { concurrency: 1 });
      queue.enqueue(image("a"));

      const drained = queue.drain();
      queue.enqueue(image("b"));
      docker.finish("a");
      await settle();
      expect(peek.status(drained)).toBe("pending");

      docker.finish("b");
      await settle();
      expect(peek.status(drained)).toBe("fulfilled");
    });

    test("can be called more than once", async () => {
      const docker = fakePush();
      const queue = createUploadQueue(docker);
      queue.enqueue(image("a"));
      const first = queue.drain();
      const second = queue.drain();

      docker.finish("a");
      await settle();
      expect([peek.status(first), peek.status(second)]).toEqual(["fulfilled", "fulfilled"]);

      queue.enqueue(image("b"));
      const third = queue.drain();
      await settle();
      expect(peek.status(third)).toBe("pending");

      docker.finish("b");
      await settle();
      expect(peek.status(third)).toBe("fulfilled");
    });

    test("rejects with the first error, once the other pushes have settled", async () => {
      const docker = fakePush();
      const queue = createUploadQueue(docker, { concurrency: 2 });
      for (const name of ["a", "b", "c"]) queue.enqueue(image(name));
      const outcome = queue.drain().then(
        () => "resolved",
        (error: unknown) => error,
      );

      docker.fail("a", new Error("a failed"));
      await settle();
      docker.fail("b", new Error("b failed"));
      await settle();
      expect(peek.status(outcome)).toBe("pending");
      expect(docker.calls.map(([local]) => local)).toEqual(["local/a", "local/b", "local/c"]);

      docker.finish("c");

      expect(await outcome).toEqual(new Error("a failed"));
    });

    test("an error nobody was waiting for goes to the next drain, once", async () => {
      const docker = fakePush();
      const queue = createUploadQueue(docker);
      queue.enqueue(image("a"));
      docker.fail("a", new Error("a failed"));
      await settle();

      expect(queue.drain()).rejects.toEqual(new Error("a failed"));
      await settle();
      const again = queue.drain();
      await settle();
      expect(peek.status(again)).toBe("fulfilled");
    });
  });

  test("a push that throws rather than rejects counts as failed", async () => {
    const queue = createUploadQueue({
      push: () => {
        throw new Error("no daemon");
      },
    });

    queue.enqueue(image("a"));

    expect(queue.drain()).rejects.toEqual(new Error("no daemon"));
    await settle();
    expect(queue.backlog()).toBe(0);
  });

  describe("onChange", () => {
    test("is told each step, with the backlog after it", async () => {
      const docker = fakePush();
      const events: UploadEvent[] = [];
      const queue = createUploadQueue(docker, { concurrency: 1, onChange: (event) => events.push(event) });
      const broke = new Error("b failed");

      queue.enqueue(image("a"));
      queue.enqueue(image("b"));
      docker.finish("a");
      await settle();
      docker.fail("b", broke);
      await settle();

      expect(events).toEqual([
        { image: image("a"), step: "queued", backlog: 1 },
        { image: image("a"), step: "uploading", backlog: 1 },
        { image: image("b"), step: "queued", backlog: 2 },
        { image: image("a"), step: "uploaded", backlog: 1 },
        { image: image("b"), step: "uploading", backlog: 1 },
        { image: image("b"), step: "failed", backlog: 0, error: broke },
      ]);
    });

    test("one that throws doesn't break the queue", async () => {
      const docker = fakePush();
      const queue = createUploadQueue(docker, {
        onChange: () => {
          throw new Error("listener broke");
        },
      });

      queue.enqueue(image("a"));
      queue.enqueue(image("b"));
      const drained = queue.drain();
      docker.finish("a");
      docker.finish("b");
      await drained;

      expect(queue.backlog()).toBe(0);
    });
  });
});
