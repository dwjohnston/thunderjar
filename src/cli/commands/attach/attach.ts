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
import { ConfigError, findThunderjarRoot } from "../../../config/loader.ts";
import { loadProjectConfig } from "../../../config/projectConfig.ts";
import { DockerContainerError } from "../../../docker/docker.ts";
import { stopOnRuntime } from "../../../execution/onRuntime.ts";
import { painter } from "../../colour.ts";
import { reportingConfigErrors } from "../../configErrors.ts";
import { displayPath } from "../../dataDir.ts";
import { imagePrefixOption } from "../../imagePrefix.ts";
import { jsonOption } from "../../json.ts";
import { print, printError as error, printJson } from "../../output.ts";
import { detachedMessage, followToEnd, reportRunnerFailure } from "../run/followRunner.ts";
import { type RunDisplay, runDisplay, showTimings, showUnclean } from "../run/runDisplay.ts";

/**
 * Follows execution `executionId`, running on the runtime of the nearest `.thunderjar/` folder in
 * `cwd` or above it, in a runner, from its first event: writes what `run` would have, and ends as
 * it would, once the execution does. Interrupted, it
 * leaves the execution running. With `stop`, stops the execution instead: its runner, and every
 * container it left.
 */
async function attach(cwd: string, executionId: string, imagePrefix: string, stop = false, json = false, showsTimings = false): Promise<void> {
  const root = await findThunderjarRoot(cwd);
  const { runtime } = await loadProjectConfig(root);
  if (runtime === null) throw new ConfigError("attach follows an execution on a runtime, and thunderjar.config.ts gives none.");
  const paint = painter();
  if (stop) {
    try {
      const removed = await stopOnRuntime(runtime.command, executionId, imagePrefix);
      print(removed.length === 0 ? `Execution ${executionId} has nothing running on the runtime.` : `Stopped execution ${executionId}: removed ${removed.length} container${removed.length === 1 ? "" : "s"} from the runtime.`);
    } catch (caught) {
      if (!(caught instanceof DockerContainerError)) throw caught;
      error(`Couldn't stop execution ${executionId} on the runtime: ${caught.message}`);
      process.exitCode = 1;
    }
    return;
  }
  let display: RunDisplay | undefined;
  let containers = 0;
  const following = new AbortController();
  const detach = (signal: "SIGINT" | "SIGTERM") => {
    following.abort();
    display?.stop();
    error(detachedMessage(signal, executionId));
    process.exit(signal === "SIGINT" ? 130 : 143);
  };
  process.on("SIGINT", () => detach("SIGINT"));
  process.on("SIGTERM", () => detach("SIGTERM"));
  try {
    const { execution, recordedIn, containerRuns } = await followToEnd(
      runtime.command,
      executionId,
      imagePrefix,
      root,
      (submission) => {
        containers = submission.plan.permutations.reduce((sum, permutation) => sum + permutation.iterations.length, 0);
        display = runDisplay({
          testCase: submission.testCase,
          permutations: submission.plan.permutations.length,
          concurrent: submission.concurrency > 1,
          stored: true,
          remote: true,
          paint,
        });
        print(`${paint.dim("Execution")} ${paint.bold(executionId)}`);
        print(paint.dim(`Following test case ${submission.name}, on the runtime`));
        return { hooks: display.hooks, plan: submission.plan };
      },
      following.signal,
    );
    display?.stop();
    for (const line of showUnclean(display?.unclean ?? [], containers, paint)) print(line);
    print(paint.dim(`Recorded in ${displayPath(cwd, recordedIn)}`));
    if (json) printJson({ execution, recordedIn, containerRuns });
    if (execution.status === "failed") process.exitCode = 1;
  } catch (caught) {
    display?.stop();
    if (!(display?.reportFailure(caught, cwd) ?? false) && !reportRunnerFailure(caught, executionId)) throw caught;
    process.exitCode = 1;
  } finally {
    display?.stop();
    const timings = display?.timings();
    if (showsTimings && timings !== undefined) print(showTimings(timings));
  }
}

export function createAttachCommand(): Command {
  return new Command("attach")
    .description(
      "Follow an execution that's running on the runtime, in a runner (thunderjar.config.ts's runtime.runner), after `run` was interrupted or lost its connection: writes what `run` would have, from the execution's start, and ends as `run` would. Interrupting it leaves the execution running. --stop stops the execution instead.",
    )
    .argument("<execution ID>", "the execution's ID, as `run` printed it")
    .option("--stop", "stop the execution: its runner, and every container it left on the runtime")
    .option("--timings", "once the execution ends, print how long each of its phases took")
    .addOption(imagePrefixOption())
    .addOption(jsonOption())
    .action(
      reportingConfigErrors(async (executionId: string, options: { stop?: boolean; imagePrefix: string; json?: boolean; timings?: boolean }) =>
        attach(process.cwd(), executionId, options.imagePrefix, options.stop, options.json, options.timings),
      ),
    );
}
