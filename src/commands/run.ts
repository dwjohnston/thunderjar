// `thunderjar run <test case> --dry-run` — spec/100-cli-reference.md#run. Creates an execution
// ID, then walks every permutation and iteration in order and prints the container run each
// would be: its prerun image, its postrun image and the harness command, without running
// anything. Running for real is a later story; until then `--dry-run` is required.

import { findThunderjarRoot, loadTestCase } from "../config.ts";
import { planExecution } from "../execution.ts";
import { permutationRows } from "../permutations.ts";
import { ulid } from "../ulid.ts";
import { count } from "./plan.ts";

export interface RunOptions {
  dryRun: boolean;
  cwd?: string;
  /** Makes the execution ID; stubbed in tests so output is deterministic. */
  newExecutionId?: () => string;
}

const indent = (text: string, spaces: number) =>
  text
    .split("\n")
    .map((line) => " ".repeat(spaces) + line)
    .join("\n");

/** `n/total`, with `n` padded to the width of `total` so the lines line up. */
const ordinal = (n: number, total: number) => `${String(n).padStart(String(total).length)}/${total}`;

export async function run(name: string, options: RunOptions): Promise<string> {
  const { dryRun, cwd = process.cwd(), newExecutionId = () => ulid() } = options;
  if (!dryRun) throw new Error("error: `thunderjar run` only supports --dry-run so far");

  const root = findThunderjarRoot(cwd);
  const testCase = await loadTestCase(root, name);
  const execution = await planExecution(root, testCase, newExecutionId());

  const { permutations, iterations } = execution;
  const header =
    `Execution ${execution.executionId} ` +
    `(dry run, ${count(permutations.length, "permutation")} × ${count(iterations, "iteration")})`;

  // Each permutation: its number and five names, its prerun image, then each iteration's
  // postrun image with the harness command below it.
  const rows = permutationRows(permutations.map((p) => p.permutation));
  const entries = permutations.map(({ prerunTag, runs }, n) =>
    [
      `Permutation ${ordinal(n + 1, permutations.length)}  ${rows[n]}`,
      `  ${prerunTag}`,
      ...runs.map(
        ({ iterationIndex, postrunTag, command }) =>
          `  iteration ${ordinal(iterationIndex + 1, iterations)}  ${postrunTag}\n${indent(command, 4)}`,
      ),
    ].join("\n"),
  );

  return [header, ...entries].join("\n\n");
}
