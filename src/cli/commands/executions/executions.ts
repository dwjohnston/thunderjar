// `thunderjar executions [<test case>]` — spec/100-cli-reference.md#executions. Lists the test
// case executions in the run data store, newest first: execution ID, test case, and when it
// started, in UTC to the minute. `--data-dir` reads a store kept outside the project.

import { jsonFileStore, runDataStorePath } from "../../../store/run-data-store.ts";
import { minute } from "../format.ts";

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
