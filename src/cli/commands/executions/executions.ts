// `thunderjar executions [<test case>]` — spec/100-cli-reference.md#executions. Lists the test
// case executions in the run data store, newest first: execution ID, test case, and when it
// started, in UTC to the minute. `--data-dir` reads a store kept outside the project.

import { Command } from "commander";
import { jsonFileStore, runDataStorePath } from "../../../store/run-data-store.ts";
import { minute } from "../format.ts";
import { dataDirOption } from "../options.ts";

export async function executions(
  testCase?: string,
  { cwd = process.cwd(), dataDir }: { cwd?: string; dataDir?: string } = {},
): Promise<string> {
  const store = jsonFileStore(runDataStorePath(cwd, dataDir));
  const listed = await store.listExecutions(testCase);
  if (listed.length === 0) {
    return testCase === undefined ? "No executions recorded." : `No executions recorded for ${testCase}.`;
  }
  const width = Math.max(...listed.map((e) => e.testCase.length));
  return listed.map((e) => `${e.executionId}  ${e.testCase.padEnd(width)}  ${minute(e.ranAt)}`).join("\n");
}

export function createExecutionsCommand(): Command {
  return new Command("executions")
    .description("List recorded executions.")
    .argument("[test case]", "list only this test case's executions")
    .addOption(dataDirOption())
    .action(async (testCase: string | undefined, options: { dataDir?: string }) => {
      console.log(await executions(testCase, { dataDir: options.dataDir }));
    });
}
