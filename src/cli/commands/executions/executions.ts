import { Command } from "commander";
import { FOLDER } from "../../../config/loader.ts";
import { type ExecutionRecord, RunDataStoreError, sqliteStore } from "../../../store/runDataStore.ts";
import { type Paint, padEnd, painter, plain, printError } from "../../colour.ts";
import { reportingConfigErrors } from "../../configErrors.ts";
import { dataDirOption, displayPath, storeFileOf } from "../../dataDir.ts";
import { minute, paintStatus, plural } from "../../format.ts";

/** One line per execution, in the order given: its ID, test case, when it started, its matrix and its status, in aligned columns. */
export function renderExecutions(executions: ExecutionRecord[], paint: Paint = plain): string {
  const testCaseWidth = Math.max(...executions.map(({ testCase }) => testCase.length));
  const matrices = executions.map(
    ({ matrix }) => `${plural(matrix.permutations, "permutation")} × ${plural(matrix.iterations, "iteration")}`,
  );
  const width = Math.max(...matrices.map((matrix) => matrix.length));
  return executions
    .map(
      (execution, i) =>
        `${paint.bold(execution.executionId)}  ${padEnd(paint.magenta(execution.testCase), testCaseWidth)}  ${paint.dim(minute(execution.startedAt))}  ${matrices[i]!.padEnd(width)}  ${paintStatus(execution.status, paint)}`,
    )
    .join("\n");
}

/**
 * Lists the executions in the run data store, of test case `testCase` only if given, newest
 * first. The store is in `dataDir`, or the one the config of the nearest `.thunderjar/` folder in `cwd` or above it names.
 */
async function executions(cwd: string, testCase?: string, dataDir?: string): Promise<void> {
  const store = await storeFileOf(cwd, dataDir);
  let listed: ExecutionRecord[];
  try {
    listed = await sqliteStore(store).listExecutions();
  } catch (error) {
    if (!(error instanceof RunDataStoreError)) throw error;
    printError(`Can't read ${displayPath(cwd, error.path)}: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  const paint = painter();
  if (testCase !== undefined) listed = listed.filter((execution) => execution.testCase === testCase);
  if (listed.length === 0) {
    console.log(paint.dim(testCase === undefined ? "No executions recorded." : `No executions of ${testCase} recorded.`));
  } else {
    console.log(renderExecutions(listed, paint));
  }
}

export function createExecutionsCommand(): Command {
  return new Command("executions")
    .description(
      "List past executions from the run data store, newest first: each one's ID, its test case, when it started (in UTC), its permutations and iterations, and whether it's running, complete or failed.",
    )
    .argument("[test case]", `list only the executions of this test case, declared in ${FOLDER}/test-cases/<test case>.ts`)
    .addOption(dataDirOption())
    .action(
      reportingConfigErrors(async (testCase: string | undefined, options: { dataDir?: string }) => {
        await executions(process.cwd(), testCase, options.dataDir);
      }),
    );
}
