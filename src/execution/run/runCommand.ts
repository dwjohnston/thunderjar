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

// Level 1: `thunderjar run <test case>`. Splits its options, resolves the test case from the
// project's files, and hands it to level 2 with the mode. It owns the displayer: the levels below
// only write to the state, and so does this, so nothing here prints or exits. What went wrong
// becomes the state's `failure`, and the exit code is returned.
import { moduleLogger } from "../../log/logger.ts";
import { type RunState, setFailure, setPhase, updateRun } from "../../services/ApplicationState/ApplicationState.ts";
import type { StopSignal } from "../../services/Io/Io.ts";
import { describeFailure } from "./describeFailure.ts";
import { resolveTestCase } from "./resolveTestCase.ts";
import { createRunControl } from "./runControl.ts";
import { RuntimeHookError, runTestCase } from "./runTestCase.ts";
import { splitOptions } from "./splitOptions.ts";
import type { Dependencies, ExecutionResult, Manifest, RunMode, RunOptions } from "./types.ts";

const log = moduleLogger("run");

/** What a process killed by each signal exits with: 128 and the signal's number. */
const SIGNAL_EXIT: Record<StopSignal, number> = { SIGINT: 130, SIGTERM: 143 };

/**
 * Runs test case `testCaseName` as `options` say, and returns the exit code:
 *
 * - 0: it did what was asked: a dry run, a build, or an execution whose agents all exited 0;
 * - 1: the execution failed, or something stopped it, said in the state's `failure`;
 * - 130 or 143: it was interrupted (Ctrl-C) or asked to stop.
 *
 * Never throws. When asked to stop, no new image is built and no new run starts, the execution's
 * containers are removed so its agents stop spending, the execution is recorded as failed, and
 * the runtime's `afterExecution` still runs. What is under way then is waited for only a short
 * while (STOP_SETTLE_MS), and not at all once asked a second time, so the command always gets to
 * `afterExecution` and returns: whoever stops a command kills it outright if it lingers.
 *
 * The state's `result` is what `--json` prints: `{ manifest }` for a dry run, `{ manifest, images }`
 * for `--build-only`, else `{ execution, recordedIn, containerRuns }`.
 */
export async function runCommand(testCaseName: string, options: RunOptions, deps: Dependencies): Promise<number> {
  const { displayer, state, clock } = deps;
  const update = (change: (run: RunState<Manifest>) => RunState<Manifest>) => state.update(updateRun(change));
  const startedAt = clock.now();
  let exitCode = 0;

  // The first signal asks everything to stop; a second stops the waiting too.
  const control = createRunControl();
  let stopped: StopSignal | undefined;
  const unsubscribe = deps.io.onStop((signal) => {
    const again = stopped !== undefined;
    stopped ??= signal;
    log.warn({ signal, again, executionId: state.get().run.manifest?.executionId }, "asked to stop");
    if (again) control.force();
    else control.stop();
  });

  /** Whether any run has got further than waiting its turn. */
  const anyStarted = () => Object.values(state.get().run.runs).some(({ status }) => status !== "queued" && status !== "cancelled");
  const fail = (error: unknown) => {
    exitCode = 1;
    log.error({ err: error }, "run failed");
    update((run) => setFailure(run, describeFailure(error, { cwd: deps.env.cwd, started: anyStarted() })));
  };
  const finished = (mode: RunMode, result: ExecutionResult | undefined) => {
    const { manifest, images } = state.get().run;
    if (result !== undefined) {
      const { execution, recordedIn, containerRuns } = result;
      update((run) => ({ ...run, result: { execution, recordedIn, containerRuns } }));
      if (execution.status === "failed") exitCode = 1;
    } else if (mode === "dry-run") update((run) => ({ ...run, result: { manifest } }));
    else if (mode === "build-only") update((run) => ({ ...run, result: { manifest, images } }));
  };

  try {
    // `--json` is read here too, so that options that can't be split are still reported as asked.
    displayer.setMode(options.json ? "json" : "interactive");
    displayer.start();
    update((run) => setPhase(run, "resolving"));
    const { overrides, mode } = splitOptions(options);
    // A build runs no agent, so it needs none of the variables an agent does.
    const config = await resolveTestCase(testCaseName, overrides, deps, { forRuns: mode !== "build-only" });
    if (stopped === undefined) finished(mode, await runTestCase(config, deps, mode, control));
  } catch (error) {
    fail(error);
    // `afterExecution` failed, but only after the execution was recorded.
    if (error instanceof RuntimeHookError && error.result !== undefined) finished("full", error.result);
  } finally {
    unsubscribe();
    if (stopped !== undefined) {
      exitCode = SIGNAL_EXIT[stopped];
      const { manifest, recordedIn } = state.get().run;
      const what = recordedIn === undefined || manifest === undefined ? "stopped before any container ran" : `stopped execution ${manifest.executionId}'s containers${manifest.remote ? " on the runtime" : ""}`;
      update((run) => setFailure(run, `Interrupted (${stopped}): ${what}.`));
    }
    const wallMs = clock.now() - startedAt;
    update((run) => ({ ...run, exitCode, timings: { wallMs, phases: run.timings?.phases ?? {} } }));
    displayer.stop();
  }
  return exitCode;
}
