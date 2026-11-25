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

// Level 3: run every planned run, up to the concurrency, then wait for the uploads.
import { runPermutation } from "../runPermutation/runPermutation.ts";
import { createScheduler } from "../scheduler/scheduler.ts";
import type { Dependencies, Manifest, RunRecord } from "../types.ts";
import { createUploadQueue } from "../uploadQueue/uploadQueue.ts";

export async function runManifest(manifest: Manifest, deps: Dependencies): Promise<RunRecord[]> {
  const uploads = createUploadQueue(deps.runtimeDocker);
  const scheduler = createScheduler({
    clock: deps.clock,
    isBackedUp: () => uploads.backlog() > deps.settings.uploadBacklogCap,
    settings: { cacheWarmupMs: 5_000, backpressurePollMs: 1_000 },
  });

  const records = await scheduler.run(manifest, (run) => runPermutation(run, deps, uploads));
  await uploads.drain();
  return records;
}
