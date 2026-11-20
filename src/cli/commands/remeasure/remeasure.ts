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

// `thunderjar remeasure <execution>`: takes the task's measurements, as they are on disk now, of
// each past container run, in a new measurement container from its postrun image, without
// running its agent again. The new measures become the run's `result`; those it had are kept
// beside them, in `earlierResults`.
import { Command } from "commander";
import { findThunderjarRoot } from "../../../config/loader.ts";
import { loadMeasurements } from "../../../config/measurements.ts";
import { remeasureContainerRun, withNewResult } from "../../../execution/remeasure.ts";
import { reportingConfigErrors } from "../../configErrors.ts";
import { dataDirOption, openStore } from "../../dataDir.ts";
import { plural } from "../../format.ts";
import { imagePrefixOption } from "../../imagePrefix.ts";
import { print } from "../../output.ts";

type Options = { dataDir?: string; imagePrefix: string };

async function remeasure(cwd: string, target: string, { dataDir, imagePrefix }: Options): Promise<void> {
  const root = await findThunderjarRoot(cwd);
  const { store } = await openStore(cwd, dataDir, root);
  const executions = (await store.listExecutions()).filter((execution) => execution.executionId === target);
  let remeasured = 0;
  for (const execution of executions) {
    const measurements = await loadMeasurements(root, execution.task);
    for (const run of await store.containerRunsOf(execution.executionId)) {
      const result = await remeasureContainerRun(run, measurements, imagePrefix);
      await store.recordContainerRun(withNewResult(run, result));
      remeasured++;
    }
  }
  print(`remeasured ${plural(remeasured, "run")}`);
}

export function createRemeasureCommand(): Command {
  return new Command("remeasure")
    .description(
      "Take the task's measurements, as they are on disk now, of past container runs, without running their agents again: each run is measured in a new measurement container from its postrun image. The new measures are what `show` shows; the earlier ones are kept beside them.",
    )
    .argument("<test case | execution>", "an execution's ID, as listed by `thunderjar executions`")
    .addOption(dataDirOption())
    .addOption(imagePrefixOption())
    .action(
      reportingConfigErrors(async (target: string, options: Options) => {
        await remeasure(process.cwd(), target, options);
      }),
    );
}
