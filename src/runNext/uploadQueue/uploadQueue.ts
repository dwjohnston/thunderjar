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
import { moduleLogger } from "../../log/logger.ts";
import { patchRun, setUploadBacklog, updateRun } from "../../services/ApplicationState/ApplicationState.ts";
import type { DockerService } from "../../services/Docker/Docker.ts";
import { timed } from "../timed/timed.ts";
import type { CommittedImage, Dependencies } from "../types.ts";

const log = moduleLogger("runNext");

export type UploadFailure = { image: CommittedImage; reason: string };

export interface UploadQueue {
  enqueue(image: CommittedImage): void;
  /** Committed images not yet pushed: those waiting, and those being pushed. */
  backlog(): number;
  /** Resolves once every enqueued image is pushed, or has failed to. Never rejects. */
  drain(): Promise<void>;
  /** The images that couldn't be pushed, and why. */
  failures(): UploadFailure[];
}

/**
 * Pushes with `docker`, up to `concurrency` at once, in the order enqueued. It writes the backlog,
 * and each run's `uploading` then `uploaded`, to the state. A run that crashed or timed out keeps
 * that status: its image is pushed all the same. A push that fails is a failure, with why on its run.
 */
export function createUploadQueue(docker: Pick<DockerService, "push">, deps: Pick<Dependencies, "state" | "clock">, concurrency = 1): UploadQueue {
  const { state } = deps;
  const waiting: CommittedImage[] = [];
  const failed: UploadFailure[] = [];
  let active = 0;
  let drained: PromiseWithResolvers<void> | undefined;
  const backlog = () => waiting.length + active;
  const changed = () => {
    state.update(updateRun((run) => setUploadBacklog(run, backlog())));
    if (backlog() === 0) {
      drained?.resolve();
      drained = undefined;
    }
  };
  const statusOf = (runId: string) => state.get().run.runs[runId]?.status;
  const upload = async (image: CommittedImage) => {
    if (statusOf(image.runId) === "committed") state.update(updateRun((run) => patchRun(run, image.runId, { status: "uploading" })));
    try {
      await timed(deps, "pushPostrun", () => docker.push(image.image, image.reference));
      if (statusOf(image.runId) === "uploading") state.update(updateRun((run) => patchRun(run, image.runId, { status: "uploaded" })));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      log.error({ ...image, err: error }, "couldn't push a postrun image");
      failed.push({ image, reason });
      state.update(updateRun((run) => patchRun(run, image.runId, { error: `Its postrun image wasn't pushed to ${image.reference}: ${reason}` })));
    }
  };
  const pump = () => {
    while (active < concurrency && waiting.length > 0) {
      const image = waiting.shift() as CommittedImage;
      active++;
      void upload(image).finally(() => {
        active--;
        changed();
        pump();
      });
    }
  };
  return {
    enqueue(image) {
      waiting.push(image);
      state.update(updateRun((run) => setUploadBacklog(run, backlog())));
      pump();
    },
    backlog,
    drain() {
      if (backlog() === 0) return Promise.resolve();
      drained ??= Promise.withResolvers<void>();
      return drained.promise;
    },
    failures: () => [...failed],
  };
}
