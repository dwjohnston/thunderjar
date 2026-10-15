// `thunderjar plan <test case>` — spec/100-cli-reference.md#plan,
// spec/055-declaring-test-cases.md#declaration. Lists the parameters a test case names with
// their parameter hashes, then its matrix shape, container run count, and each permutation
// with its prerun image. Whether that image exists is a later story.

import { findThunderjarRoot, loadTestCase } from "../config.ts";
import { abbreviateHash } from "../hashing.ts";
import { matrixShape, permutationRows } from "../permutations.ts";
import { resolveTestCase } from "../resolve.ts";
import { prerunTag } from "../tags.ts";

/** The parameter lines, in declaration field order. `task` has no hash of its own. */
const LABELS = ["baseImage", "codeState", "promptSet", "harnessModel", "task", "initialPrompt"] as const;

const LABEL_WIDTH = Math.max(...LABELS.map((label) => label.length)) + 2; // + ":" + one space

export const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

export async function plan(name: string, cwd: string = process.cwd()): Promise<string> {
  const root = findThunderjarRoot(cwd);
  const testCase = await loadTestCase(root, name);
  const { hashes, permutations } = await resolveTestCase(root, testCase);

  const parameterLines = LABELS.map((label) => {
    const value =
      label === "task"
        ? testCase.task
        : testCase[label].map((n) => `${n} (${abbreviateHash(hashes[label].get(n)!)})`).join(", ");
    return `${(label + ":").padEnd(LABEL_WIDTH)}${value}`;
  });

  const runs = permutations.length * testCase.iterations;
  const summary =
    `Matrix shape: ${matrixShape(testCase).join("/")} ` +
    `(${count(permutations.length, "permutation")} × ${count(testCase.iterations, "iteration")} = ${count(runs, "container run")})`;

  // Each permutation: a right-aligned number, then the five names as columns; below, its
  // prerun image, which carries the permutation hash.
  const rows = permutationRows(permutations);
  const numberWidth = Math.max(2, String(permutations.length).length);
  const entries = permutations.map(
    (permutation, n) =>
      `${String(n + 1).padStart(numberWidth)}  ${rows[n]}\n` +
      `${" ".repeat(numberWidth + 2)}${prerunTag(permutation.hash)}`,
  );

  return [...parameterLines, "", summary, "", entries.join("\n\n")].join("\n");
}
