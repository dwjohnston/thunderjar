import { Command } from "commander";
import type { TestCaseDeclaration } from "../../../api/declarations.ts";
import { FOLDER, findThunderjarRoot } from "../../../config/loader.ts";
import { AXES, parsePair } from "../../../config/permutations.ts";
import { loadTestCase } from "../../../config/testCase.ts";
import { DockerBuildError, DockerContainerError, DockerUnavailableError } from "../../../docker/docker.ts";
import { type PlannedExecution, type PlannedPermutation, planExecution } from "../../../execution/planExecution.ts";
import { runExecution } from "../../../execution/runExecution.ts";
import { ulid } from "../../../execution/ulid.ts";
import { executionFolder, fileStore, type RecordedMeasure, type RecordedOutcome } from "../../../store/runDataStore.ts";
import { reportingConfigErrors } from "../../configErrors.ts";
import { dataDirOf, dataDirOption, displayPath } from "../../dataDir.ts";
import { imagePrefixOption } from "../../imagePrefix.ts";

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
export async function dryRun(cwd: string, name: string, imagePrefix?: string): Promise<string> {
  const root = await findThunderjarRoot(cwd);
  const executionId = ulid();
  const testCase = await loadTestCase(root, name);
  return renderExecution(await planExecution(root, testCase, executionId, imagePrefix));
}

/** `n/total`, `n` padded to the width of `total`, so the lines line up. */
const ordinal = (n: number, total: number) => `${String(n).padStart(String(total).length)}/${total}`;

/** `ms` as e.g. `850ms` or `12.3s`. */
const duration = (ms: number) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);

/** A measured value as `run` prints it: JSON, but with an object's keys unquoted, `{passed: 4, failed: 1}`. */
const showValue = (value: unknown): string =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? `{${Object.entries(value)
        .map(([key, v]) => `${key}: ${showValue(v)}`)
        .join(", ")}}`
    : (JSON.stringify(value) ?? String(value));

/** A measure as `run` prints it: its value, or why it has none. */
const showOutcome = (outcome: RecordedOutcome) =>
  outcome.outcome === "measured"
    ? showValue(outcome.data)
    : outcome.outcome === "skipped"
      ? `skipped${outcome.reason ? ` (${outcome.reason})` : ""}`
      : `erroredWhileMeasuring (${outcome.error.message})`;

/** A container run's measures, on one line: `<name>: <value>`, three spaces apart. */
const showMeasures = (result: Record<string, RecordedMeasure>) =>
  Object.entries(result)
    .map(([name, { outcome }]) => `${name}: ${showOutcome(outcome)}`)
    .join("   ");

/**
 * What tells `permutation` apart from the rest of `testCase`'s: each other axis that varies, then
 * its harness, by name alone unless two of the test case's pairs share one, and its initial prompt.
 */
function label(testCase: TestCaseDeclaration, { permutation }: PlannedPermutation): string {
  const varying = AXES.filter((axis) => axis !== "harnessModel" && axis !== "initialPrompt" && testCase[axis].length > 1);
  const harnesses = new Set(testCase.harnessModel.map((pair) => parsePair(pair).harness));
  const harness = harnesses.size === testCase.harnessModel.length ? parsePair(permutation.harnessModel).harness : permutation.harnessModel;
  return [...varying.map((axis) => permutation[axis]), harness, permutation.initialPrompt].join(" | ");
}

/**
 * Runs test case `name`, of the nearest `.thunderjar/` folder in `cwd` or above it: builds its
 * missing prerun images, then runs each iteration in a container, writing a line for each as it
 * finishes, and one of its measures once they're taken, and records them in the run data store
 * under `dataDir`. Exits 1 if any agent exits non-zero, or with an error if Docker fails.
 */
async function run(cwd: string, name: string, imagePrefix: string, dataDir?: string): Promise<void> {
  const root = await findThunderjarRoot(cwd);
  const testCase = await loadTestCase(root, name);
  const plan = await planExecution(root, testCase, ulid(), imagePrefix);
  const store = dataDirOf(cwd, root, dataDir);
  const permutations = plan.permutations.length;

  console.log(`Execution ${plan.executionId}`);
  let building: string | undefined;
  // Whether the last line written is waiting for how its build or container run ends.
  let lineOpen = false;
  try {
    const record = await runExecution({ root, name, testCase, plan, imagePrefix }, fileStore(store), {
      onBuilding: (image) => {
        building = image;
        lineOpen = true;
        process.stdout.write(`Building ${image} ... `);
      },
      onBuilt: () => {
        building = undefined;
        lineOpen = false;
        console.log("done");
      },
      onRunning: (permutation, iteration) => {
        lineOpen = true;
        process.stdout.write(
          ` ${ordinal(permutation.number, permutations)}  iteration ${ordinal(iteration.number, testCase.iterations)}  ${label(testCase, permutation)}  ... `,
        );
      },
      onRan: (_permutation, _iteration, { startedAt, finishedAt, exitCode }) => {
        lineOpen = false;
        console.log(exitCode === 0 ? `done (${duration(finishedAt - startedAt)})` : `failed (exit ${exitCode})`);
      },
      onMeasured: (permutation, _iteration, result) => {
        // Under the iteration, lined up with it.
        console.log(`${" ".repeat(ordinal(permutation.number, permutations).length + 3)}${showMeasures(result)}`);
      },
    });
    console.log(`Wrote ${displayPath(cwd, executionFolder(store, plan.executionId))}/`);
    if (record.status === "failed") process.exitCode = 1;
  } catch (error) {
    if (error instanceof DockerUnavailableError) {
      console.error(`Error: Docker can't be reached, so nothing can be run: ${error.message}`);
    } else if (error instanceof DockerBuildError) {
      console.log("failed");
      console.error(`Error: Building ${building} failed: ${error.message}`);
    } else if (error instanceof DockerContainerError && lineOpen) {
      console.log("failed");
      console.error(`Error: Running a container failed: ${error.message}`);
    } else if (error instanceof DockerContainerError) {
      console.error(`Error: Measuring a container run failed: ${error.message}`);
    } else {
      throw error;
    }
    process.exitCode = 1;
  }
}

export function createRunCommand(): Command {
  return new Command("run")
    .description(
      "Run a test case: one execution, with a new ID. Builds any missing prerun image, then runs each iteration of each permutation in a container from its prerun image, commits it into its postrun image, takes the task's measurements of it, each in a container from its postrun image, and records it in the run data store.",
    )
    .argument("<test case>", `the name of a test case, declared in ${FOLDER}/test-cases/<test case>.ts`)
    .option("--dry-run", "print the images and harness commands the execution would use, without running anything")
    .addOption(imagePrefixOption())
    .addOption(dataDirOption())
    .action(
      reportingConfigErrors(async (name: string, options: { dryRun?: boolean; imagePrefix: string; dataDir?: string }) => {
        if (options.dryRun) console.log(await dryRun(process.cwd(), name, options.imagePrefix));
        else await run(process.cwd(), name, options.imagePrefix, options.dataDir);
      }),
    );
}
