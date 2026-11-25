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
import { updateRun } from "../../services/ApplicationState/ApplicationState.ts";
import { ensureImages } from "../ensureImages/ensureImages.ts";
import { plan } from "../plan/plan.ts";
import { runManifest } from "../runManifest/runManifest.ts";
import type { Dependencies, RunMode, RunRecord, TestCaseConfig } from "../types.ts";

export async function runTestCase(config: TestCaseConfig, deps: Dependencies, mode: RunMode = "full"): Promise<RunRecord[] | undefined> {
  const manifest = plan(config, { concurrency: deps.settings.concurrency, executionId: deps.random.ulid() });
  deps.state.update(updateRun((run) => ({ ...run, manifest })));
  if (mode === "dry-run") return; // the displayer shows it
  await ensureImages(manifest, deps);
  if (mode === "build-only") return;
  return runManifest(manifest, deps);
}
