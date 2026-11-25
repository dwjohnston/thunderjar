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

// The upload queue: committed postrun images waiting to be pushed to the image store. A run hands
// its image over and frees its slot at once; the pushes go on behind, a few at a time.
import { moduleLogger } from "../../log/logger.ts";
import type { DockerService } from "../../services/Docker/Docker.ts";
import type { CommittedImage, UploadQueue } from "./types.ts";

const log = moduleLogger("uploadQueue");

export type UploadStatus = "queued" | "uploading" | "uploaded" | "failed";

export type UploadEvent = { image: CommittedImage; status: UploadStatus; error?: string };

export type UploadFailure = { image: CommittedImage; error: string };

export type UploadQueueOptions = {
  docker: Pick<DockerService, "push">;
  /** The most pushes at once. 2 by default. */
  concurrency?: number;
  /** Called at each step of each image, after the backlog has changed. */
  onChange?: (event: UploadEvent) => void;
};

/** An UploadQueue that also keeps what it couldn't push. */
export interface TrackedUploadQueue extends UploadQueue {
  /** Every push that failed, in the order they failed. */
  failures(): UploadFailure[];
}

export function createUploadQueue({ docker, concurrency = 2, onChange }: UploadQueueOptions): TrackedUploadQueue {
  const waiting: CommittedImage[] = [];
  const failures: UploadFailure[] = [];
  let drained: (() => void)[] = [];
  let uploading = 0;

  const tell = (event: UploadEvent) => {
    try {
      onChange?.(event);
    } catch (error) {
      // A listener's bug mustn't stop the uploads.
      log.error({ err: error }, "An upload queue listener threw.");
    }
  };

  const upload = async (image: CommittedImage): Promise<void> => {
    tell({ image, status: "uploading" });
    let error: string | undefined;
    try {
      await docker.push(image.image, image.reference);
    } catch (thrown) {
      error = thrown instanceof Error ? thrown.message : String(thrown);
      log.warn({ runId: image.runId, reference: image.reference, error }, "A postrun image could not be pushed.");
      failures.push({ image, error });
    }
    uploading--;
    tell(error === undefined ? { image, status: "uploaded" } : { image, status: "failed", error });
    pump();
  };

  const pump = () => {
    while (uploading < Math.max(1, concurrency)) {
      const image = waiting.shift();
      if (image === undefined) break;
      uploading++;
      void upload(image);
    }
    if (waiting.length + uploading === 0) {
      const resolves = drained;
      drained = [];
      for (const resolve of resolves) resolve();
    }
  };

  return {
    enqueue(image) {
      waiting.push(image);
      tell({ image, status: "queued" });
      pump();
    },
    backlog: () => waiting.length + uploading,
    drain: () => (waiting.length + uploading === 0 ? Promise.resolve() : new Promise<void>((resolve) => drained.push(resolve))),
    failures: () => [...failures],
  };
}
