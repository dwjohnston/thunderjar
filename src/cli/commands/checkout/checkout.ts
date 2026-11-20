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
import { reportingConfigErrors } from "../../configErrors.ts";
import { dataDirOption } from "../../dataDir.ts";

type Options = { dataDir?: string; shell?: boolean };

async function checkout(_cwd: string, _runId: string, _options: Options): Promise<void> {}

export function createCheckoutCommand(): Command {
  return new Command("checkout")
    .description("Bring a container run's end state back, to inspect what happened.")
    .argument("<run>", "the container run's ID, e.g. 01K4X9J2E8MQZ3V7R5T0WABCDE-h4f9a21c8-i00")
    .option("--shell", "open a shell in its postrun image, in the workspace, instead")
    .addOption(dataDirOption())
    .action(reportingConfigErrors(async (runId: string, options: Options) => checkout(process.cwd(), runId, options)));
}
