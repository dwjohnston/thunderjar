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

// Pushes committed post-run images, with its own concurrency, so a run slot frees up at commit.
import type { DockerService } from "../../services/Docker/Docker.ts";
import type { CommittedImage } from "../types.ts";

export type UploadEvent = {
  image: CommittedImage;
  step: "queued" | "uploading" | "uploaded" | "failed";
  /** After this event. */
  backlog: number;
  /** Only when `step` is "failed". */
  error?: unknown;
};

export interface UploadQueue {
  enqueue(image: CommittedImage): void;
  /** Committed images not yet pushed: queued or being pushed. */
  backlog(): number;
  /**
   * Resolves once every image enqueued, including any enqueued while it waits, has been pushed.
   * Rejects with the first push error, once the rest have settled. An error is reported once:
   * to every `drain` waiting when the queue empties, or else to the next `drain` called.
   */
  drain(): Promise<void>;
}

export function createUploadQueue(
  docker: Pick<DockerService, "push">,
  options: { concurrency?: number; onChange?: (event: UploadEvent) => void } = {},
): UploadQueue {
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? 2));
  const queued: CommittedImage[] = [];
  const errors: unknown[] = [];
  let waiting: PromiseWithResolvers<void>[] = [];
  let pushing = 0;

  const backlog = () => queued.length + pushing;

  function emit(image: CommittedImage, step: UploadEvent["step"], error?: unknown): void {
    try {
      options.onChange?.({ image, step, backlog: backlog(), ...(step === "failed" ? { error } : {}) });
    } catch {
      // A listener's failure is its own: the queue carries on.
    }
  }

  /** Settles every waiting `drain`, with the first error since the last one reported. */
  function settle(): void {
    const waiters = waiting;
    waiting = [];
    const failures = errors.splice(0);
    for (const waiter of waiters) {
      if (failures.length > 0) waiter.reject(failures[0]);
      else waiter.resolve();
    }
  }

  async function push(image: CommittedImage): Promise<void> {
    emit(image, "uploading");
    let failure: { error: unknown } | undefined;
    try {
      await docker.push(image.image, image.reference);
    } catch (error) {
      failure = { error };
      errors.push(error);
    }
    pushing--;
    if (failure === undefined) emit(image, "uploaded");
    else emit(image, "failed", failure.error);
    pump();
    if (backlog() === 0 && waiting.length > 0) settle();
  }

  function pump(): void {
    while (pushing < concurrency) {
      const image = queued.shift();
      if (image === undefined) return;
      pushing++;
      void push(image);
    }
  }

  return {
    enqueue(image) {
      queued.push(image);
      emit(image, "queued");
      pump();
    },
    backlog,
    drain() {
      const waiter = Promise.withResolvers<void>();
      waiting.push(waiter);
      if (backlog() === 0) settle();
      return waiter.promise;
    },
  };
}
