import { Command } from "commander";
import { FOLDER, findThunderjarRoot } from "../../../config/loader.ts";
import { loadTestCase } from "../../../config/testCase.ts";
import { type PlannedExecution, planExecution } from "../../../execution/planExecution.ts";
import { ulid } from "../../../execution/ulid.ts";
import { reportingConfigErrors } from "../../configErrors.ts";

const indent = (text: string, by: string) =>
  text
    .split("\n")
    .map((line) => by + line)
    .join("\n");

/** The execution's ID, then each permutation's prerun image, with each iteration's postrun image and harness command. */
export function renderExecution({ executionId, permutations }: PlannedExecution): string {
  const blocks = permutations.map((permutation) =>
    [
      `Permutation ${permutation.number}: prerun image ${permutation.prerunImage}`,
      ...permutation.iterations.flatMap((iteration) => [
        `  Iteration ${iteration.number}: postrun image ${iteration.postrunImage}`,
        indent(iteration.command, "    "),
      ]),
    ].join("\n"),
  );
  return [`Execution ${executionId}`, ...blocks].join("\n\n");
}

/** What an execution of test case `name`, of the nearest `.thunderjar/` folder in `cwd` or above it, would do. */
export async function dryRun(cwd: string, name: string): Promise<string> {
  const root = await findThunderjarRoot(cwd);
  const executionId = ulid();
  const testCase = await loadTestCase(root, name);
  return renderExecution(await planExecution(root, testCase, executionId));
}

export function createRunCommand(): Command {
  return new Command("run")
    .description(
      "Run a test case: one execution, with a new ID. So far only a dry run is possible: it prints each permutation's prerun image, and each iteration's postrun image and harness command.",
    )
    .argument("<test case>", `the name of a test case, declared in ${FOLDER}/test-cases/<test case>.ts`)
    .option("--dry-run", "print the images and harness commands the execution would use, without running anything")
    .action(
      reportingConfigErrors(async (name: string, options: { dryRun?: boolean }) => {
        if (!options.dryRun) {
          console.error("Error: Running a test case is not implemented yet; use --dry-run.");
          process.exitCode = 1;
          return;
        }
        console.log(await dryRun(process.cwd(), name));
      }),
    );
}
