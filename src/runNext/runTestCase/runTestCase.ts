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
import { registryHost } from "../../config/projectConfig.ts";
import { DockerLoginError } from "../../docker/docker.ts";
import { ImageStoreLoginError } from "../../execution/imageStore.ts";
import { moduleLogger } from "../../log/logger.ts";
import { setDetails, updateRun } from "../../services/ApplicationState/ApplicationState.ts";
import { ensureImages } from "../ensureImages/ensureImages.ts";
import { plan } from "../plan/plan.ts";
import { runManifest } from "../runManifest/runManifest.ts";
import { emptyDetails, logEvent } from "../state/state.ts";
import type { Dependencies, HookName, Manifest, RunMode, RunRecord, TestCaseConfig } from "../types.ts";

const log = moduleLogger("execution");

/** Checks the host's Docker holds a login for the image store's registry, if there's one. Throws an ImageStoreLoginError. */
async function checkImageStore({ imageStore }: TestCaseConfig, deps: Pick<Dependencies, "hostDocker">): Promise<void> {
  if (imageStore === null) return;
  const host = registryHost(imageStore.repository);
  try {
    await deps.hostDocker.checkLogin(host);
  } catch (error) {
    if (error instanceof DockerLoginError) throw new ImageStoreLoginError(imageStore.repository, host, error.message);
    throw error;
  }
}

/** Runs the runtime's `hook`, if it has one. Throws a RuntimeHookError if it fails. */
async function runHook(hook: HookName, manifest: Manifest, deps: Pick<Dependencies, "runtimeHooks" | "state" | "clock">): Promise<void> {
  const command = manifest.config.runtime?.[hook];
  if (command === undefined) return;
  logEvent(deps, { type: "hook", hook, command, step: "running" });
  try {
    await deps.runtimeHooks.run(hook, command, { executionId: manifest.executionId, concurrency: manifest.concurrency, containers: manifest.runs.length });
  } catch (error) {
    logEvent(deps, { type: "hook", hook, command, step: "failed" });
    throw error;
  }
  logEvent(deps, { type: "hook", hook, command, step: "done" });
}

/**
 * Before anything is built: the image store's login, and, for a full run, the run data store, so
 * neither is found out after the agents have run. A full run is wrapped in the runtime's
 * `beforeExecution` and `afterExecution`: once the first has run, the second always does, however
 * the execution ends. If `beforeExecution` fails, nothing else runs. If the execution and
 * `afterExecution` both fail, throws an AggregateError of the two, in that order.
 */
export async function runTestCase(config: TestCaseConfig, deps: Dependencies, mode: RunMode = "full"): Promise<RunRecord[] | undefined> {
  const manifest = plan(config, { concurrency: deps.settings.concurrency, executionId: deps.random.ulid() });
  // Checked before the state has anything to show, so a run that can't start writes only why.
  if (mode !== "dry-run") await checkImageStore(config, deps);
  if (mode === "full") await deps.runStore.check();
  // What was written before there was a manifest is kept: a request to stop, which may come at any time.
  deps.state.update(updateRun((run) => setDetails({ ...run, manifest }, (details) => ({ ...details, ...emptyDetails(mode, deps.clock.now()), log: details?.log ?? [] }))));
  if (mode === "dry-run") return; // the displayer shows it
  if (mode === "build-only") return void (await ensureImages(manifest, deps));
  log.info({ executionId: manifest.executionId, testCase: manifest.testCaseName, task: manifest.task, permutations: manifest.permutations.length, runs: manifest.runs.length, concurrency: manifest.concurrency }, "execution starting");
  await runHook("beforeExecution", manifest, deps);
  let failure: { error: unknown } | undefined;
  let records: RunRecord[] | undefined;
  try {
    await ensureImages(manifest, deps);
    records = await runManifest(manifest, deps);
  } catch (error) {
    failure = { error };
  }
  try {
    await runHook("afterExecution", manifest, deps);
  } catch (error) {
    // Both are said: what the execution stopped on, then that the runtime may not have been released.
    throw failure === undefined ? error : new AggregateError([failure.error, error]);
  }
  if (failure !== undefined) throw failure.error;
  return records;
}
