/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiw2YB851n82Y1sd8t
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */

// `thunderjar remeasure <test case | execution>`: takes the task's measurements, as they are on
// disk now, of past container runs, each in a new measurement container from its postrun image,
// without running its agent again: an execution's runs, or a test case's, of every past execution
// of it. The new measures become the run's `result`; those it had are kept beside them, in
// `earlierResults`.
import { Command } from "commander";
import { findThunderjarRoot } from "../../../config/loader.ts";
import { loadMeasurements } from "../../../config/measurements.ts";
import { remeasureContainerRun, skipReason, withNewResult } from "../../../execution/remeasure.ts";
import { runName } from "../../../execution/executionSummary.ts";
import { moduleLogger } from "../../../log/logger.ts";
import type { RecordedMeasure } from "../../../store/runDataStore.ts";
import { reportingConfigErrors } from "../../configErrors.ts";
import { dataDirOption, openStore } from "../../dataDir.ts";
import { plural } from "../../format.ts";
import { imagePrefixOption } from "../../imagePrefix.ts";
import { jsonOption } from "../../json.ts";
import { print, printError, printJson } from "../../output.ts";

const log = moduleLogger("remeasure");

/** Why runs were skipped: the reason, if they share one, else how many each, e.g. `2 postrun image purged, 1 never started`. */
function reasons(skipped: { reason: string }[]): string {
  const counts = Map.groupBy(skipped, ({ reason }) => reason);
  if (counts.size === 1) return [...counts.keys()][0]!;
  return [...counts].map(([reason, runs]) => `${runs.length} ${reason}`).join(", ");
}

type Options = { dataDir?: string; imagePrefix: string; json?: boolean };

/** A container run, by its execution and its place in it, e.g. `1-1`. */
type RunAt = { executionId: string; run: string };

async function remeasure(cwd: string, target: string, { dataDir, imagePrefix, json = false }: Options): Promise<void> {
  const root = await findThunderjarRoot(cwd);
  const { store } = await openStore(cwd, dataDir, root);
  // An execution by its ID, or else every execution of a test case, oldest first.
  const recorded = (await store.listExecutions()).toReversed();
  const byId = recorded.filter((execution) => execution.executionId === target);
  const executions = byId.length > 0 ? byId : recorded.filter((execution) => execution.testCase === target);
  if (executions.length === 0) {
    printError(`No execution or test case ${target} recorded. List the executions with \`thunderjar executions\`.`);
    process.exitCode = 1;
    return;
  }
  const remeasured: RunAt[] = [];
  const skipped: (RunAt & { reason: string })[] = [];
  const failed: (RunAt & { error: string })[] = [];
  for (const execution of executions) {
    const measurements = await loadMeasurements(root, execution.task);
    for (const run of await store.containerRunsOf(execution.executionId)) {
      const at: RunAt = { executionId: execution.executionId, run: runName(run) };
      const reason = skipReason(run);
      if (reason !== undefined) {
        skipped.push({ ...at, reason });
        continue;
      }
      let result: Record<string, RecordedMeasure>;
      try {
        result = await remeasureContainerRun(run, measurements, imagePrefix);
      } catch (error) {
        // Docker couldn't start its measurement container, e.g. its postrun image was deleted
        // without being marked purged: the others may still be measured.
        const message = error instanceof Error ? error.message : String(error);
        log.warn({ ...at, postrunImage: run.postrunImage, error: message }, "couldn't remeasure");
        printError(`Couldn't remeasure ${at.executionId} ${at.run}: ${message}`);
        failed.push({ ...at, error: message });
        continue;
      }
      log.info({ ...at, result }, "remeasured");
      await store.recordContainerRun(withNewResult(run, result));
      remeasured.push(at);
    }
  }
  if (failed.length > 0) process.exitCode = 1;
  const skips = skipped.length === 0 ? "" : `, skipped ${skipped.length} (${reasons(skipped)})`;
  print(`remeasured ${plural(remeasured.length, "run")}${skips}${failed.length === 0 ? "" : `, ${failed.length} failed`}`);
  for (const { executionId, run, reason } of skipped) print(`  ${executionId} ${run}  ${reason}`);
  if (json) printJson({ remeasured, skipped, failed });
}

export function createRemeasureCommand(): Command {
  return new Command("remeasure")
    .description(
      "Take the task's measurements, as they are on disk now, of past container runs, without running their agents again: each run is measured in a new measurement container from its postrun image. The new measures are what `show` shows; the earlier ones are kept beside them.",
    )
    .argument("<test case | execution>", "an execution's ID, as listed by `thunderjar executions`, or a test case's name, for every past execution of it")
    .addOption(dataDirOption())
    .addOption(imagePrefixOption())
    .addOption(jsonOption())
    .action(
      reportingConfigErrors(async (target: string, options: Options) => {
        await remeasure(process.cwd(), target, options);
      }),
    );
}
