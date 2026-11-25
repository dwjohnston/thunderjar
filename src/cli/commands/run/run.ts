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

// `run`: the command line of src/runNext/, and, with a runner in the config, of runOnRunner.ts.
import { Command, InvalidArgumentError, Option } from "commander";
import { FOLDER, findThunderjarRoot } from "../../../config/loader.ts";
import type { Overrides } from "../../../config/overrides.ts";
import { isConcurrency, loadProjectConfig } from "../../../config/projectConfig.ts";
import { runCommand } from "../../../runNext/runCommand/runCommand.ts";
import type { Dependencies, RunOptions } from "../../../runNext/types.ts";
import { reportingConfigErrors } from "../../configErrors.ts";
import { dataDirOption } from "../../dataDir.ts";
import { imagePrefixOption } from "../../imagePrefix.ts";
import { jsonOption } from "../../json.ts";
import { printError } from "../../output.ts";
import { overridesOf, withOverrideOptions } from "../../overrides.ts";
import type { Services } from "../../services.ts";
import { describeFailure } from "./runFailure.ts";
import { runOnRunner } from "./runOnRunner.ts";

/** The services `runNext` uses, picked from those src/cli/index.ts built. */
function dependencies(services: Services): Dependencies {
  const { io, runSettings, runDataStore, runDataStoreLocation, ...rest } = services;
  return { ...rest, settings: runSettings, runStore: runDataStore, runStoreLocation: runDataStoreLocation, stdout: io.stdout, stderr: io.stderr, onStop: io.onStop };
}

/** Whether the project in `cwd` runs its executions in a runner on its runtime. Throws a ConfigError. */
async function usesRunner(cwd: string): Promise<boolean> {
  return (await loadProjectConfig(await findThunderjarRoot(cwd))).runtime?.runner !== undefined;
}

type Options = Overrides & { dryRun?: boolean; buildOnly?: boolean; concurrency?: number; imagePrefix: string; dataDir?: string; json?: boolean; timings?: boolean };

export function createRunCommand(services: Services): Command {
  return withOverrideOptions(new Command("run"))
    .description(
      "Run a test case: one execution, with a new ID. Builds any missing prerun image, then runs each iteration of each permutation in a container from its prerun image, commits it into its postrun image, takes the task's measurements of it, in a container from its postrun image, and records it in the run data store. With an image store in thunderjar.config.ts, checks your docker login for its registry first, and pushes each prerun and postrun image there. With a runtime in thunderjar.config.ts, builds the prerun images on it and runs the containers there, up to its concurrency at once, or THUNDERJAR_CONCURRENCY, or --concurrency. --iterations overrides the test case's iterations.",
    )
    .argument("<test case>", `the name of a test case, declared in ${FOLDER}/test-cases/<test case>.ts`)
    .option("--dry-run", "show the manifest: every permutation, run and image, without building or running anything")
    .option("--build-only", "build the missing prerun images, and push them to the image store if there's one, without running anything")
    .addOption(
      new Option("--concurrency <n>", "run up to <n> containers at once, instead of the runtime's concurrency, or one at a time").argParser((value: string) => {
        const n = Number(value);
        if (!/^\d+$/.test(value) || !isConcurrency(n)) throw new InvalidArgumentError("It must be a whole number, 1 or more.");
        return n;
      }),
    )
    .option("--timings", "once the execution ends, show how long each of its phases took: builds, pushes, pulls, agents, commits and measuring")
    .addOption(imagePrefixOption())
    .addOption(dataDirOption())
    .addOption(jsonOption())
    .action(
      reportingConfigErrors(async (name: string, options: Options) => {
        const overrides = overridesOf(options);
        const { cwd } = services.env;
        // Runner mode is still on the old path: see runOnRunner.ts.
        if (!options.dryRun && !options.buildOnly && (await usesRunner(cwd))) {
          await runOnRunner(cwd, name, options.imagePrefix, options.dataDir, options.concurrency, overrides, options.json, options.timings);
          return;
        }
        const given: RunOptions = {
          ...overrides,
          dryRun: options.dryRun,
          buildOnly: options.buildOnly,
          json: options.json,
          concurrency: options.concurrency,
          imagePrefix: options.imagePrefix,
          timings: options.timings,
        };
        try {
          const { exitCode } = await runCommand(name, given, dependencies(services));
          // Interrupted: its containers are gone, and whatever was waiting on them is left behind.
          if (exitCode >= 128) process.exit(exitCode);
          if (exitCode !== 0) process.exitCode = exitCode;
        } catch (caught) {
          const failure = describeFailure(caught, cwd);
          if (failure === undefined) throw caught;
          printError(failure);
          process.exitCode = 1;
        }
      }),
    );
}
