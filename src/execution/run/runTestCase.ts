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

// Level 2: a resolved test case, as far as the mode says. Plans it into a manifest, which a dry
// run stops at; makes sure its prerun images are ready, which `--build-only` stops at; then runs
// the manifest. A full run is wrapped in the runtime's hooks: `beforeExecution` before anything is
// built, e.g. to start a rented server, and `afterExecution` however it ended, to release it.
import { moduleLogger } from "../../log/logger.ts";
import { addWarning, type RunPhase, type RunState, setPhase, updateRun } from "../../services/ApplicationState/ApplicationState.ts";
import { ensureImages } from "./ensureImages.ts";
import { plan } from "./plan.ts";
import { type RunControl, runManifest } from "./runManifest.ts";
import type { Dependencies, ExecutionResult, Manifest, RunMode, TestCaseConfig } from "./types.ts";

const log = moduleLogger("execution");

type Hook = "beforeExecution" | "afterExecution";

/** Thrown when a runtime hook exits non-zero, or can't be started: the message is its reason. */
export class RuntimeHookError extends Error {
  constructor(
    message: string,
    readonly hook: Hook,
    /** What the execution returned, if it was `afterExecution` that failed, after it. */
    readonly result?: ExecutionResult,
  ) {
    super(message);
  }
}

type RunTestCaseDeps = Pick<Dependencies, "hostDocker" | "runtimeDocker" | "fs" | "env" | "random" | "state" | "clock" | "commands" | "stores" | "measurer">;

/**
 * Plans `config` and writes the manifest to the state, then, unless `mode` says to stop sooner,
 * builds its images and runs it. Returns what a full run recorded; nothing for a dry run, a
 * build-only one, or one stopped through `control` before its runs began.
 *
 * At most `--concurrency` containers run at once, or THUNDERJAR_CONCURRENCY, or the runtime's, or one.
 *
 * Throws what `ensureImages` and `runManifest` do, and a RuntimeHookError if a hook fails. If
 * `beforeExecution` fails nothing else is done, `afterExecution` included.
 */
export async function runTestCase(config: TestCaseConfig, deps: RunTestCaseDeps, mode: RunMode = "full", control: RunControl = {}): Promise<ExecutionResult | undefined> {
  const update = (change: (run: RunState<Manifest>) => RunState<Manifest>) => deps.state.update(updateRun(change));
  const phase = (next: RunPhase) => update((run) => setPhase(run, next));

  const concurrency = config.concurrency ?? deps.env.concurrency ?? config.runtime?.concurrency ?? 1;
  const manifest = plan(config, { concurrency });
  update((run) => config.warnings.reduce<RunState<Manifest>>((s, warning) => addWarning(s, warning), { ...run, manifest, executionId: manifest.executionId, phase: "planned" }));
  if (mode === "dry-run") return undefined; // the displayer shows it

  // Not `planned` while a hook runs: that is what a dry run shows in full.
  phase("building");
  if (mode === "build-only") {
    await ensureImages(manifest, deps);
    phase("done");
    return undefined;
  }

  await runHook("beforeExecution", manifest, deps);
  let result: ExecutionResult | undefined;
  try {
    if (control.shouldStop?.() !== true) await ensureImages(manifest, deps);
    if (control.shouldStop?.() !== true) {
      phase("running");
      result = await runManifest(manifest, deps, control);
    }
    phase("done");
  } catch (error) {
    // So a runtime started for the execution is released. What stopped the execution is the news:
    // a hook failing as well is only logged.
    await runHook("afterExecution", manifest, deps).catch((hookError: unknown) => {
      log.error({ executionId: manifest.executionId, error: hookError instanceof Error ? hookError.message : String(hookError) }, "the runtime's afterExecution failed");
      update((run) => addWarning(run, `The runtime's afterExecution failed: ${hookError instanceof Error ? hookError.message : String(hookError)}`));
    });
    throw error;
  }
  try {
    await runHook("afterExecution", manifest, deps);
  } catch (error) {
    // The execution is recorded all the same: whoever catches this can still say so.
    if (error instanceof RuntimeHookError) throw new RuntimeHookError(error.message, error.hook, result);
    throw error;
  }
  return result;
}

/** What a hook is told about the execution, in variables. */
export const hookEnv = (manifest: Pick<Manifest, "executionId" | "concurrency" | "runs">): Record<string, string> => ({
  THUNDERJAR_EXECUTION_ID: manifest.executionId,
  THUNDERJAR_CONCURRENCY: String(manifest.concurrency),
  // Each run has its own container.
  THUNDERJAR_CONTAINERS: String(manifest.runs.length),
});

/**
 * Runs the runtime's `hook`, if it has one, and waits for it. Throws a RuntimeHookError, with the
 * last line it wrote to stderr, if it exits non-zero or can't be started.
 */
async function runHook(hook: Hook, manifest: Manifest, deps: Pick<Dependencies, "commands">): Promise<void> {
  const command = manifest.hooks[hook];
  if (command === undefined) return;
  log.info({ executionId: manifest.executionId, hook, command }, "running a runtime hook");
  const { exitCode, stderr } = await deps.commands.run(command, hookEnv(manifest));
  if (exitCode === 0) return;
  const reason = stderr.trim().split("\n").at(-1);
  throw new RuntimeHookError(reason || `\`${command.join(" ")}\` exited ${exitCode}`, hook);
}
