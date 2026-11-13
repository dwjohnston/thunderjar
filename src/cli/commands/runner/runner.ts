/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLkjATuQXxaawiKKoPy
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { Command } from "commander";
import { findThunderjarRoot } from "../../../config/loader.ts";
import { removeExecutionContainers } from "../../../execution/runExecution.ts";
import { receiveSubmission, runSubmission } from "../../../execution/runner.ts";
import { failureOf, type RunnerEvent } from "../../../execution/runnerEvents.ts";
import type { Submission } from "../../../execution/runnerSpec.ts";
import type { ExecutionRecord } from "../../../store/runDataStore.ts";
import { reportingConfigErrors } from "../../configErrors.ts";
import { print } from "../../output.ts";

/** How long a runner being stopped waits for its execution to be recorded as failed. */
const STOP_SETTLE_MS = 15_000;

/**
 * Runs the execution submitted at `submissionPath`, with the nearest `.thunderjar/` folder in
 * `cwd` or above it, on the local Docker daemon, writing each event as a line of JSON on stdout.
 * Stopped with SIGTERM, as `docker stop` does, it removes the execution's containers first, so
 * the execution is recorded as failed. Exits 1 if the execution stopped on an error.
 */
async function runner(cwd: string, submissionPath: string): Promise<void> {
  const root = await findThunderjarRoot(cwd);
  let submission: Submission;
  try {
    submission = await receiveSubmission(submissionPath);
  } catch (caught) {
    // None arrived, or it isn't one: said as its last event, so whoever follows is told why.
    print(JSON.stringify({ event: "failed", failure: failureOf(caught) } satisfies RunnerEvent));
    process.exitCode = 1;
    return;
  }
  let executing: Promise<ExecutionRecord> | undefined;
  let stopping = false;
  const stop = (signal: "SIGINT" | "SIGTERM") => {
    if (stopping) return;
    stopping = true;
    void (async () => {
      await removeExecutionContainers(submission.plan.executionId, submission.imagePrefix, null).catch(() => {});
      await Promise.race([executing?.catch(() => {}), Bun.sleep(STOP_SETTLE_MS)]);
      process.exit(signal === "SIGINT" ? 130 : 143);
    })();
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));
  const record = await runSubmission(
    root,
    submission,
    (event) => print(JSON.stringify(event)),
    (execution) => (executing = execution),
  );
  if (record === undefined) process.exitCode = 1;
}

export function createRunnerCommand(): Command {
  return new Command("runner")
    .description(
      "Internal: what a runtime's runner runs. Waits for the execution `run` submits, a file at --submission, then runs it on the local Docker daemon, with the project in the current folder, and writes each thing it does as a line of JSON.",
    )
    .requiredOption("--submission <path>", "where the submitted execution is written")
    .action(reportingConfigErrors(async (options: { submission: string }) => runner(process.cwd(), options.submission)));
}
