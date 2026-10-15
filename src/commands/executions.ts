// `thunderjar executions [<test case>]` — spec/100-cli-reference.md#executions. Lists the test
// case executions in the run data store, newest first: execution ID, test case, and when it
// started, in UTC to the minute.

import { findThunderjarRoot } from "../config.ts";
import { defaultRunDataStorePath, jsonFileStore } from "../run-data-store.ts";

/** `2026-09-29 14:30`, from an ISO timestamp. */
const minute = (iso: string) => iso.slice(0, 16).replace("T", " ");

export async function executions(testCase?: string, cwd: string = process.cwd()): Promise<string> {
  const store = jsonFileStore(defaultRunDataStorePath(findThunderjarRoot(cwd)));
  const listed = await store.listExecutions(testCase);
  if (listed.length === 0) {
    return testCase === undefined ? "No executions recorded." : `No executions recorded for ${testCase}.`;
  }
  const width = Math.max(...listed.map((e) => e.testCase.length));
  return listed.map((e) => `${e.executionId}  ${e.testCase.padEnd(width)}  ${minute(e.ranAt)}`).join("\n");
}
