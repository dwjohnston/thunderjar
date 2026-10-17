// `thunderjar remeasure <test case | execution>` — spec/100-cli-reference.md#remeasure. Will apply
// today's measurements to past container runs without rerunning the agent. For now an execution
// only prints its plan (spec/110-cli-report-visualization.md#remeasure): each of its task's
// current measurements, up to date or new / changed, and each name deleted from the task with how
// many measures of it are kept. It measures nothing, writes nothing to the store and recomputes
// no aggregation result. A test case is only recognised.
//
// The argument is tried as an execution ID, then a test case name, as `show` resolves it; a
// postrun tag isn't a target. `--data-dir` reads a store kept outside the project.

import { abbreviateHash } from "../../matrix/hashing.ts";
import { planRemeasure, type ExecutionSummary } from "../../measuring/remeasure.ts";
import { findThunderjarRoot, loadMeasurements } from "../../project/config.ts";
import { jsonFileStore, runDataStorePath } from "../../store/run-data-store.ts";
import { count } from "../format.ts";

/** An execution's plan: its header, then a row per measurement name, current ones first, in one column. */
function executionReport(task: string, containerRuns: number, { executionId, measurements, deleted }: ExecutionSummary) {
  const rows: [name: string, status: string][] = [
    ...measurements.map(({ name, contentHash, status }): [string, string] => [
      name,
      status === "current" ? "up to date" : `new / changed (${abbreviateHash(contentHash)})`,
    ]),
    ...deleted.map(({ name, storedMeasures }): [string, string] => [
      name,
      `deleted from task; ${count(storedMeasures, "stored measure")} kept, excluded from aggregates`,
    ]),
  ];
  const width = Math.max(...rows.map(([name]) => name.length));
  return [
    `Execution ${executionId}  (${count(containerRuns, "container run")})`,
    `Current measurements for task ${task}:`,
    ...rows.map(([name, status]) => `  ${name.padEnd(width)}  ${status}`),
    "",
    "Not implemented: applying measurements and recomputing aggregation results.",
  ].join("\n");
}

export async function remeasure(
  target: string,
  { cwd = process.cwd(), dataDir }: { cwd?: string; dataDir?: string } = {},
): Promise<string> {
  const store = jsonFileStore(runDataStorePath(cwd, dataDir));

  const records = await store.getExecution(target);
  if (records.length > 0) {
    const { task } = records[0]!;
    const measurements = await loadMeasurements(findThunderjarRoot(cwd), task);
    const [summary] = planRemeasure(records, measurements).executions;
    return executionReport(task, records.length, summary!);
  }

  if ((await store.listExecutions(target)).length > 0) return "Not implemented: remeasure by test case.";

  throw new Error(`${target} is not a recorded execution or test case`);
}
