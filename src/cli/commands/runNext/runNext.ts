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

// `run-next`: the reimplementation of `run`, hidden until it replaces `run`.
import { Command } from "commander";
import { FOLDER } from "../../../config/loader.ts";
import { runCommand } from "../../../runNext/runCommand/runCommand.ts";
import type { Dependencies, RunOptions } from "../../../runNext/types.ts";
import { reportingConfigErrors } from "../../configErrors.ts";
import { withOverrideOptions } from "../../overrides.ts";
import type { Services } from "../../services.ts";

/** The services `runNext` uses, picked from those src/cli/index.ts built. */
function dependencies(services: Services): Dependencies {
  const { io, runSettings, runDataStore, ...rest } = services;
  return { ...rest, settings: runSettings, runStore: runDataStore, stdout: io.stdout, stderr: io.stderr };
}

export function createRunNextCommand(services: Services): Command {
  return withOverrideOptions(new Command("run-next"))
    .description("Internal: the reimplementation of `run`. Not working yet.")
    .argument("<test case>", `the name of a test case, declared in ${FOLDER}/test-cases/<test case>.ts`)
    .option("--dry-run", "show the manifest: every permutation, run and image, without building or running anything")
    .option("--build-only", "build the missing pre-run images, without running anything")
    .option("--json", "write the result to stdout as JSON")
    .action(reportingConfigErrors(async (name: string, options: RunOptions) => void (await runCommand(name, options, dependencies(services)))));
}
