import { Command } from "commander";
import { FOLDER } from "../../../config/loader.ts";
import { type ExecutionRecord, RunDataStoreError } from "../../../store/runDataStore.ts";
import { type Paint, padEnd, painter, plain } from "../../colour.ts";
import { reportingConfigErrors } from "../../configErrors.ts";
import { dataDirOption, displayPath, openStore } from "../../dataDir.ts";
import { minute, paintExecutionStatus, plural } from "../../format.ts";
import { jsonOption } from "../../json.ts";
import { print, printError, printJson } from "../../output.ts";

/**
 * One line per execution, in the order given: its ID, test case, when it started, its matrix and its
 * status, in aligned columns, with what it was doing if it stopped on an error, e.g. `failed (build)`.
 */
export function renderExecutions(executions: ExecutionRecord[], paint: Paint = plain): string {
  const testCaseWidth = Math.max(...executions.map(({ testCase }) => testCase.length));
  const matrices = executions.map(
    ({ matrix }) => `${plural(matrix.permutations, "permutation")} × ${plural(matrix.iterations, "iteration")}`,
  );
  const width = Math.max(...matrices.map((matrix) => matrix.length));
  return executions
    .map(
      (execution, i) =>
        `${paint.bold(execution.executionId)}  ${padEnd(paint.magenta(execution.testCase), testCaseWidth)}  ${paint.dim(minute(execution.startedAt))}  ${matrices[i]!.padEnd(width)}  ${paintExecutionStatus(execution, paint)}`,
    )
    .join("\n");
}

/**
 * Lists the executions in the run data store, of test case `testCase` only if given, newest
 * first. The store is in `dataDir`, or the one the config of the nearest `.thunderjar/` folder in `cwd` or above it names.
 * With `json`, prints them as a JSON array of their records, `[]` if there are none.
 */
async function executions(cwd: string, testCase?: string, dataDir?: string, json = false): Promise<void> {
  const { store } = await openStore(cwd, dataDir);
  let listed: ExecutionRecord[];
  try {
    listed = await store.listExecutions();
  } catch (error) {
    if (!(error instanceof RunDataStoreError)) throw error;
    printError(`Can't read ${displayPath(cwd, error.path)}: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  const paint = painter();
  if (testCase !== undefined) listed = listed.filter((execution) => execution.testCase === testCase);
  if (json) {
    printJson(listed);
  } else if (listed.length === 0) {
    print(paint.dim(testCase === undefined ? "No executions recorded." : `No executions of ${testCase} recorded.`));
  } else {
    print(renderExecutions(listed, paint));
  }
}

export function createExecutionsCommand(): Command {
  return new Command("executions")
    .description(
      "List past executions from the run data store, newest first: each one's ID, its test case, when it started (in UTC), its permutations and iterations, and whether it's running, complete or failed, with what it was doing if it stopped on an error, e.g. `failed (build)`.",
    )
    .argument("[test case]", `list only the executions of this test case, declared in ${FOLDER}/test-cases/<test case>.ts`)
    .addOption(dataDirOption())
    .addOption(jsonOption())
    .action(
      reportingConfigErrors(async (testCase: string | undefined, options: { dataDir?: string; json?: boolean }) => {
        await executions(process.cwd(), testCase, options.dataDir, options.json);
      }),
    );
}
