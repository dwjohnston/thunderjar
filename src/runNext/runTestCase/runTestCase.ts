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

// Level 2: plan the execution, then build its images, then run it, stopping early for the mode.
import { addNote, updateRun } from "../../services/ApplicationState/ApplicationState.ts";
import { ensureImages } from "../ensureImages/ensureImages.ts";
import { runHook } from "../hooks/hooks.ts";
import { plan } from "../plan/plan.ts";
import { runManifest } from "../runManifest/runManifest.ts";
import type { Dependencies, RunMode, RunRecord, TestCaseConfig } from "../types.ts";

/**
 * Around everything but a dry run, the runtime's `beforeExecution` and `afterExecution` run, the
 * second however it ended. A `beforeExecution` that fails is thrown, as a RuntimeHookError; an
 * `afterExecution` that fails is the state's `error`, so what the execution did still comes back.
 */
export async function runTestCase(config: TestCaseConfig, deps: Dependencies, mode: RunMode = "full"): Promise<RunRecord[] | undefined> {
  const manifest = plan(config, { concurrency: config.concurrency, executionId: deps.random.ulid() });
  deps.state.update(updateRun((run) => ({ ...run, manifest, ...(mode !== "full" && { mode }) })));
  if (mode === "dry-run") return; // the displayer shows it
  await runHook("beforeExecution", manifest, config);
  try {
    await ensureImages(manifest, config, deps);
    if (mode === "build-only") return;
    return await runManifest(manifest, config, deps);
  } finally {
    await runHook("afterExecution", manifest, config).catch((error: unknown) => {
      const why = `The runtime's afterExecution failed: ${error instanceof Error ? error.message : String(error)}`;
      deps.state.update(updateRun((run) => ({ ...addNote(run, why), error: run.error ?? why })));
    });
  }
}
