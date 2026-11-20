/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: session_01LCLeLiw2YB851n82Y1sd8t
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */

// `thunderjar checkout <run>`: brings a container run's end state back, to inspect what happened:
// as a local branch, `thunderjar/run/<test case>/<execution>/<run>`, of the agent's commits and a
// commit of what it left uncommitted, or, with `--shell`, a shell in its postrun image.
import { Command } from "commander";
import { findThunderjarRoot } from "../../../config/loader.ts";
import { loadProjectConfig } from "../../../config/projectConfig.ts";
import { DockerContainerError, remoteRuntime } from "../../../docker/docker.ts";
import {
  CheckoutError,
  checkoutBundle,
  endStateBundle,
  findContainerRun,
  gitDir,
  openShell,
  parseContainerRunId,
  runBranch,
  unavailableReason,
} from "../../../execution/checkout.ts";
import { remeasureRuntime } from "../../../execution/remeasure.ts";
import { reportingConfigErrors } from "../../configErrors.ts";
import { dataDirOption, openStore } from "../../dataDir.ts";
import { print, printError } from "../../output.ts";

type Options = { dataDir?: string; shell?: boolean };

async function checkout(cwd: string, runId: string, { dataDir, shell = false }: Options): Promise<void> {
  const fail = (reason: string) => {
    printError(`Can't check out ${runId}: ${reason}.`);
    process.exitCode = 1;
  };
  const root = await findThunderjarRoot(cwd);
  const { store } = await openStore(cwd, dataDir, root);
  const parsed = parseContainerRunId(runId);
  const run = parsed === undefined ? undefined : findContainerRun(await store.containerRunsOf(parsed.executionId), runId);
  if (run === undefined) {
    return fail("no container run with that ID is recorded. Its ID is `<execution>-h<permutation hash>-i<iteration>`, as `thunderjar show <execution>` lists it");
  }
  const reason = unavailableReason(run);
  if (reason !== undefined) return fail(reason);
  // Through the configured runtime, so a postrun image on a remote Docker host can be checked out too.
  const { runtime: configured } = await loadProjectConfig(root);
  const runtime = configured === null ? remeasureRuntime() : remoteRuntime(configured.command);
  if (shell) {
    process.exitCode = await openShell(run, runtime);
    return;
  }
  if ((await gitDir(cwd)) === undefined) return fail(`checkout makes a branch in the git repository it's run in, and ${cwd} isn't in one. Use --shell to look inside its postrun image instead`);
  const branch = runBranch(run);
  try {
    await checkoutBundle(cwd, await endStateBundle(run, runtime), branch);
  } catch (error) {
    if (!(error instanceof DockerContainerError || error instanceof CheckoutError)) throw error;
    return fail(error.message);
  }
  print(`Checked out ${branch}`);
}

export function createCheckoutCommand(): Command {
  return new Command("checkout")
    .description(
      "Bring a container run's end state back, to inspect what happened: a local branch, thunderjar/run/<test case>/<execution>/<run>, of the agent's commits and a commit of anything it left uncommitted. --shell opens a shell in its postrun image instead, on the configured runtime.",
    )
    .argument("<run>", "the container run's ID, e.g. 01K4X9J2E8MQZ3V7R5T0WABCDE-h4f9a21c8-i00")
    .option("--shell", "open a shell in its postrun image, in the workspace, instead of making a branch")
    .addOption(dataDirOption())
    .action(reportingConfigErrors(async (runId: string, options: Options) => checkout(process.cwd(), runId, options)));
}
