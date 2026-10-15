// `thunderjar run <test case>` — spec/100-cli-reference.md#run. Creates an execution ID, then
// walks every permutation and iteration in order and hands each container run to a
// ContainerRunner, printing its exit code and duration as it finishes, then a summary.
// `--dry-run` prints the container run each would be instead — its prerun image, its postrun
// image and the harness command — without running anything.

import { findThunderjarRoot, loadTestCase } from "../config.ts";
import { planExecution, type PlannedExecution } from "../execution.ts";
import { permutationRows } from "../permutations.ts";
import { createHostRunner, defaultRootDir, executionDir, type ContainerRunner } from "../runner.ts";
import { ulid } from "../ulid.ts";
import { count } from "./plan.ts";

export interface RunOptions {
  dryRun: boolean;
  cwd?: string;
  /** Receives the output a block at a time, as it is produced. */
  log?: (text: string) => void;
  /** Makes the execution ID; stubbed in tests so output is deterministic. */
  newExecutionId?: () => string;
  /** The clock for timing container runs; stubbed in tests so output is deterministic. */
  now?: () => number;
  /** Where the host runner keeps container runs. Defaults to `$TMPDIR/thunderjar`. */
  rootDir?: string;
  /** Runs each container run. Defaults to the host runner under `rootDir`. */
  runner?: ContainerRunner;
}

const indent = (text: string, spaces: number) =>
  text
    .split("\n")
    .map((line) => " ".repeat(spaces) + line)
    .join("\n");

/** `n/total`, with `n` padded to the width of `total` so the lines line up. */
const ordinal = (n: number, total: number) => `${String(n).padStart(String(total).length)}/${total}`;

const shape = ({ permutations, iterations }: PlannedExecution) =>
  `${count(permutations.length, "permutation")} × ${count(iterations, "iteration")}`;

export async function run(name: string, options: RunOptions): Promise<void> {
  const {
    dryRun,
    cwd = process.cwd(),
    log = (text) => console.log(text),
    now = Date.now,
    newExecutionId = () => ulid(now()),
    rootDir = defaultRootDir(),
    runner = createHostRunner(rootDir, now),
  } = options;

  const root = findThunderjarRoot(cwd);
  const testCase = await loadTestCase(root, name);
  const execution = await planExecution(root, testCase, newExecutionId());
  const { executionId, permutations, iterations } = execution;
  const rows = permutationRows(permutations.map((p) => p.permutation));
  const permutationLine = (n: number) => `Permutation ${ordinal(n + 1, permutations.length)}  ${rows[n]}`;

  if (dryRun) {
    // Each permutation: its number and five names, its prerun image, then each iteration's
    // postrun image with the harness command below it.
    log(`Execution ${executionId} (dry run, ${shape(execution)})`);
    permutations.forEach(({ prerunTag, runs }, n) => {
      log("");
      log(
        [
          permutationLine(n),
          `  ${prerunTag}`,
          ...runs.map(
            ({ iterationIndex, postrunTag, command }) =>
              `  iteration ${ordinal(iterationIndex + 1, iterations)}  ${postrunTag}\n${indent(command, 4)}`,
          ),
        ].join("\n"),
      );
    });
    return;
  }

  log(`Execution ${executionId} (${shape(execution)})`);
  log(`Output in ${executionDir(rootDir, executionId)}`);

  // How many container runs exited with each code. A failing agent is a result, not an error:
  // the remaining runs still run.
  const exitCodes = new Map<number, number>();
  for (const [n, { runs }] of permutations.entries()) {
    log("");
    log(permutationLine(n));
    for (const containerRun of runs) {
      const { startedAt, finishedAt, exitCode } = await runner.runContainer(containerRun);
      exitCodes.set(exitCode, (exitCodes.get(exitCode) ?? 0) + 1);
      const seconds = ((finishedAt - startedAt) / 1000).toFixed(2);
      log(
        `  iteration ${ordinal(containerRun.iterationIndex + 1, iterations)}  ${containerRun.postrunTag}` +
          `  exit ${exitCode}  ${seconds}s`,
      );
    }
  }

  const total = permutations.length * iterations;
  const byCode = [...exitCodes].toSorted(([a], [b]) => a - b).map(([code, n]) => `${n} exited ${code}`);
  log("");
  log(`${count(total, "container run")}: ${byCode.join(", ")}`);
}
