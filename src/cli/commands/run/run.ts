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

// `thunderjar run <test case>`: the commander wiring only. What it does is `runCommand`, in
// src/execution/run/, which is given every service and returns the exit code.
import { Command, InvalidArgumentError, Option } from "commander";
import { FOLDER } from "../../../config/loader.ts";
import { isConcurrency } from "../../../config/projectConfig.ts";
import { runCommand } from "../../../execution/run/runCommand.ts";
import type { Dependencies, RunOptions } from "../../../execution/run/types.ts";
import { dataDirOption } from "../../dataDir.ts";
import { imagePrefixOption } from "../../imagePrefix.ts";
import { jsonOption } from "../../json.ts";
import { withOverrideOptions } from "../../overrides.ts";

/** What `runCommand` returns when it was stopped by Ctrl-C, or by SIGTERM. */
const INTERRUPTED = 130;
const TERMINATED = 143;

export function createRunCommand(deps: Dependencies): Command {
  return withOverrideOptions(new Command("run"))
    .description(
      "Run a test case: one execution, with a new ID. Builds any missing prerun image, then runs each iteration of each permutation in a container from its prerun image, commits it into its postrun image, takes the task's measurements of it, each in a container from its postrun image, and records it in the run data store. With an image store in thunderjar.config.ts, checks your docker login for its registry first, and pushes each prerun and postrun image there. With a runtime in thunderjar.config.ts, builds the prerun images on it and runs the containers there, from the image store, up to its concurrency at once, or --concurrency. Builds up to the config's build concurrency of prerun images at once. --dry-run shows what it would do, and --build-only stops once the prerun images are built. --iterations overrides the test case's iterations.",
    )
    .argument("<test case>", `the name of a test case, declared in ${FOLDER}/test-cases/<test case>.ts`)
    .option("--dry-run", "print the plan: the matrix, each container's images, environment variables and command, and each prerun image's Dockerfile, without building or running anything")
    .option("--build-only", "build the prerun images, and push them to the image store if there is one, without running anything")
    .addOption(
      new Option("--concurrency <n>", "run up to <n> containers at once, instead of the runtime's concurrency, or one at a time").argParser((value: string) => {
        const n = Number(value);
        if (!/^\d+$/.test(value) || !isConcurrency(n)) throw new InvalidArgumentError("It must be a whole number, 1 or more.");
        return n;
      }),
    )
    .option("--timings", "once the execution ends, print how long each of its phases took: builds, pushes, pulls, agents, commits and measuring")
    .addOption(imagePrefixOption())
    .addOption(dataDirOption())
    // `run` shows nothing as it goes with --json: the displayer writes the result once, at the end.
    .addOption(jsonOption("print the results on stdout as JSON when the command ends, for scripts. stderr says where the logs are"))
    .action(async (name: string, options: RunOptions) => {
      const exitCode = await runCommand(name, options, deps);
      process.exitCode = exitCode;
      // Asked to stop. `runCommand` may have given up waiting for a build, a push or a container
      // that wouldn't end: left alone, its `docker` process would keep this one alive.
      if (exitCode === INTERRUPTED || exitCode === TERMINATED) process.exit(exitCode);
    });
}
