// `thunderjar plan <test case>` — spec/100-cli-reference.md#plan,
// spec/055-declaring-test-cases.md#declaration. Lists the parameters a test case names,
// then its matrix shape, permutations and container run count. Showing hashes and
// prerun images are later stories.

import { findThunderjarRoot, loadTestCase } from "../config.ts";
import type { TestCaseDeclaration } from "../declarations.ts";
import { AXES, expandPermutations, matrixShape } from "../permutations.ts";

const ROWS: Array<[label: string, select: (testCase: TestCaseDeclaration) => string]> = [
  ["baseImage", (t) => t.baseImage.join(", ")],
  ["codeState", (t) => t.codeState.join(", ")],
  ["promptSet", (t) => t.promptSet.join(", ")],
  ["harnessModel", (t) => t.harnessModel.join(", ")],
  ["task", (t) => t.task],
  ["initialPrompt", (t) => t.initialPrompt.join(", ")],
];

const LABEL_WIDTH = Math.max(...ROWS.map(([label]) => label.length)) + 2; // + ":" + one space

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

export async function plan(name: string, cwd: string = process.cwd()): Promise<string> {
  const root = findThunderjarRoot(cwd);
  const testCase = await loadTestCase(root, name);

  const parameters = ROWS.map(([label, select]) => `${(label + ":").padEnd(LABEL_WIDTH)}${select(testCase)}`);

  const permutations = expandPermutations(testCase);
  const runs = permutations.length * testCase.iterations;
  const summary =
    `Matrix shape: ${matrixShape(testCase).join("/")} ` +
    `(${count(permutations.length, "permutation")} × ${count(testCase.iterations, "iteration")} = ${count(runs, "container run")})`;

  // One line per permutation: a right-aligned number, then the five names as columns,
  // each padded to its widest value. The last column isn't padded.
  const cells = permutations.map((p) => AXES.map((axis) => p[axis]));
  const widths = AXES.map((_, i) => Math.max(...cells.map((row) => row[i]!.length)));
  const numberWidth = Math.max(2, String(permutations.length).length);
  const lines = cells.map((row, n) => {
    const columns = row.map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i]!)));
    return `${String(n + 1).padStart(numberWidth)}  ${columns.join(" | ")}`;
  });

  return [...parameters, "", summary, "", ...lines].join("\n");
}
