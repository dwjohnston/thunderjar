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
import { peek } from "bun";
import { createUploadQueue, type UploadEvent } from "./uploadQueue.ts";
import type { CommittedImage } from "./types.ts";

// The examples are parcels: `image` is the parcel, `reference` its address.
const parcel = (name: string): CommittedImage => ({ runId: `run-${name}`, image: `parcel:${name}`, reference: `depot/parcel:${name}` });

/** A `push` that waits until the test delivers (or loses) each one. */
function aCourier() {
  const waiting = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();
  const pushes: [string, string][] = [];
  let most = 0;
  return {
    pushes,
    most: () => most,
    carrying: () => [...waiting.keys()],
    push: (image: string, reference: string) => {
      pushes.push([image, reference]);
      return new Promise<void>((resolve, reject) => {
        waiting.set(image, { resolve, reject });
        most = Math.max(most, waiting.size);
      });
    },
    deliver: async (name: string) => {
      waiting.get(`parcel:${name}`)?.resolve();
      waiting.delete(`parcel:${name}`);
      await settle();
    },
    lose: async (name: string, message: string) => {
      waiting.get(`parcel:${name}`)?.reject(new Error(message));
      waiting.delete(`parcel:${name}`);
      await settle();
    },
  };
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("createUploadQueue", () => {
  it("pushes what is enqueued, by its image and reference", async () => {
    const courier = aCourier();
    const queue = createUploadQueue({ docker: courier });

    queue.enqueue(parcel("a"));
    await courier.deliver("a");
    await queue.drain();

    expect(courier.pushes).toEqual([["parcel:a", "depot/parcel:a"]]);
  });

  it("returns from enqueue before the push ends", () => {
    const courier = aCourier();
    const queue = createUploadQueue({ docker: courier });

    queue.enqueue(parcel("a"));

    expect(queue.backlog()).toBe(1);
    expect(courier.carrying()).toEqual(["parcel:a"]);
  });

  it("pushes two at once by default, in the order enqueued", async () => {
    const courier = aCourier();
    const queue = createUploadQueue({ docker: courier });

    for (const name of ["a", "b", "c", "d"]) queue.enqueue(parcel(name));
    expect(courier.carrying()).toEqual(["parcel:a", "parcel:b"]);

    await courier.deliver("a");
    expect(courier.carrying()).toEqual(["parcel:b", "parcel:c"]);

    await courier.deliver("b");
    await courier.deliver("c");
    await courier.deliver("d");
    expect(courier.most()).toBe(2);
    expect(courier.pushes.map(([image]) => image)).toEqual(["parcel:a", "parcel:b", "parcel:c", "parcel:d"]);
  });

  it("pushes as many at once as it's told", async () => {
    const courier = aCourier();
    const queue = createUploadQueue({ docker: courier, concurrency: 1 });

    queue.enqueue(parcel("a"));
    queue.enqueue(parcel("b"));

    expect(courier.carrying()).toEqual(["parcel:a"]);
    await courier.deliver("a");
    expect(courier.carrying()).toEqual(["parcel:b"]);
  });

  it("counts those waiting and those being pushed as its backlog", async () => {
    const courier = aCourier();
    const queue = createUploadQueue({ docker: courier });
    expect(queue.backlog()).toBe(0);

    for (const name of ["a", "b", "c"]) queue.enqueue(parcel(name));
    expect(queue.backlog()).toBe(3);

    await courier.deliver("a");
    expect(queue.backlog()).toBe(2);

    await courier.lose("b", "lost");
    expect(queue.backlog()).toBe(1);

    await courier.deliver("c");
    expect(queue.backlog()).toBe(0);
  });

  describe("drain", () => {
    it("resolves at once with nothing enqueued", async () => {
      const queue = createUploadQueue({ docker: aCourier() });

      await queue.drain();
    });

    it("resolves only once everything is pushed, whatever was enqueued after it was called", async () => {
      const courier = aCourier();
      const queue = createUploadQueue({ docker: courier });

      queue.enqueue(parcel("a"));
      const drained = queue.drain();
      queue.enqueue(parcel("b"));
      await courier.deliver("a");
      expect(peek.status(drained)).toBe("pending");

      await courier.deliver("b");
      expect(peek.status(drained)).toBe("fulfilled");
    });

    it("never rejects: a failed push is kept in failures", async () => {
      const courier = aCourier();
      const queue = createUploadQueue({ docker: courier });

      queue.enqueue(parcel("a"));
      queue.enqueue(parcel("b"));
      await courier.lose("a", "the depot is shut");
      await courier.deliver("b");
      await queue.drain();

      expect(queue.failures()).toEqual([{ image: parcel("a"), error: "the depot is shut" }]);
    });
  });

  it("carries on with the rest after a failure", async () => {
    const courier = aCourier();
    const queue = createUploadQueue({ docker: courier, concurrency: 1 });

    queue.enqueue(parcel("a"));
    queue.enqueue(parcel("b"));
    await courier.lose("a", "lost");

    expect(courier.carrying()).toEqual(["parcel:b"]);
  });

  it("counts a push that throws rather than rejects as failed", async () => {
    const queue = createUploadQueue({
      docker: {
        push: () => {
          throw new Error("no van");
        },
      },
    });

    queue.enqueue(parcel("a"));
    await queue.drain();

    expect(queue.failures()).toEqual([{ image: parcel("a"), error: "no van" }]);
  });

  describe("onChange", () => {
    it("is told each step of each image", async () => {
      const courier = aCourier();
      const events: UploadEvent[] = [];
      const queue = createUploadQueue({ docker: courier, concurrency: 1, onChange: (event) => events.push(event) });

      queue.enqueue(parcel("a"));
      queue.enqueue(parcel("b"));
      await courier.deliver("a");
      await courier.lose("b", "lost");

      expect(events).toEqual([
        { image: parcel("a"), status: "queued" },
        { image: parcel("a"), status: "uploading" },
        { image: parcel("b"), status: "queued" },
        { image: parcel("a"), status: "uploaded" },
        { image: parcel("b"), status: "uploading" },
        { image: parcel("b"), status: "failed", error: "lost" },
      ]);
    });

    it("sees the backlog already changed", async () => {
      const courier = aCourier();
      const backlogs: [string, number][] = [];
      const queue = createUploadQueue({ docker: courier, onChange: (event) => backlogs.push([event.status, queue.backlog()]) });

      queue.enqueue(parcel("a"));
      await courier.deliver("a");

      expect(backlogs).toEqual([
        ["queued", 1],
        ["uploading", 1],
        ["uploaded", 0],
      ]);
    });

    it("can't break the queue by throwing", async () => {
      const courier = aCourier();
      const queue = createUploadQueue({
        docker: courier,
        onChange: () => {
          throw new Error("listener broke");
        },
      });

      queue.enqueue(parcel("a"));
      await courier.deliver("a");
      await queue.drain();

      expect(queue.backlog()).toBe(0);
      expect(queue.failures()).toEqual([]);
    });
  });
});
