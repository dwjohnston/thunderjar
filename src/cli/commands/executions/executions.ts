import { Command } from "commander";
import { FOLDER, findThunderjarRoot } from "../../../config/loader.ts";
import { type ExecutionRecord, fileStore, RunDataStoreError } from "../../../store/runDataStore.ts";
import { reportingConfigErrors } from "../../configErrors.ts";
import { dataDirOf, dataDirOption, displayPath, resolvePath } from "../../dataDir.ts";
import { minute, plural } from "../../format.ts";

/** One line per execution, in the order given: its ID, test case, when it started, its matrix and its status, in aligned columns. */
export function renderExecutions(executions: ExecutionRecord[]): string {
  const testCaseWidth = Math.max(...executions.map(({ testCase }) => testCase.length));
  const matrices = executions.map(
    ({ matrix }) => `${plural(matrix.permutations, "permutation")} × ${plural(matrix.iterations, "iteration")}`,
  );
  const width = Math.max(...matrices.map((matrix) => matrix.length));
  return executions
    .map((execution, i) => `${execution.executionId}  ${execution.testCase.padEnd(testCaseWidth)}  ${minute(execution.startedAt)}  ${matrices[i]!.padEnd(width)}  ${execution.status}`)
    .join("\n");
}

/**
 * Lists the executions in the run data store, of test case `testCase` only if given, newest
 * first. The store is `dataDir`, or the one in the nearest `.thunderjar/` folder in `cwd` or above it.
 */
async function executions(cwd: string, testCase?: string, dataDir?: string): Promise<void> {
  const store = dataDir === undefined ? dataDirOf(cwd, await findThunderjarRoot(cwd)) : resolvePath(cwd, dataDir);
  let listed: ExecutionRecord[];
  try {
    listed = await fileStore(store).listExecutions();
  } catch (error) {
    if (!(error instanceof RunDataStoreError)) throw error;
    console.error(`Error: Can't read ${displayPath(cwd, error.path)}: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  if (testCase !== undefined) listed = listed.filter((execution) => execution.testCase === testCase);
  if (listed.length === 0) {
    console.log(testCase === undefined ? "No executions recorded." : `No executions of ${testCase} recorded.`);
  } else {
    console.log(renderExecutions(listed));
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
