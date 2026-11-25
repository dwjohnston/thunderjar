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

export interface UploadQueue {
  enqueue(image: CommittedImage): void;
  /** Committed images not yet pushed. */
  backlog(): number;
  /** Resolves once every enqueued image is pushed. */
  drain(): Promise<void>;
}

export function createUploadQueue(_docker: DockerService): UploadQueue {
  return {
    enqueue: () => {
      throw new Error("Not implemented: uploadQueue.enqueue");
    },
    backlog: () => 0,
    drain: async () => {},
  };
}
