import { Command } from "commander";
import type { TestCaseDeclaration } from "../../../api/declarations.ts";
import { FOLDER, findThunderjarRoot } from "../../../config/loader.ts";
import {
  AXES,
  abbreviateHash,
  type HashedPermutation,
  hashPermutations,
  matrixShape,
} from "../../../config/permutations.ts";
import { loadTestCase } from "../../../config/testCase.ts";
import { reportingConfigErrors } from "../../configErrors.ts";

const ROWS: [label: string, values: (testCase: TestCaseDeclaration) => string][] = [
  ["baseImage", (t) => t.baseImage.join(", ")],
  ["codeState", (t) => t.codeState.join(", ")],
  ["promptSet", (t) => t.promptSet.join(", ")],
  ["harnessModel", (t) => t.harnessModel.join(", ")],
  ["task", (t) => t.task],
  ["initialPrompt", (t) => t.initialPrompt.join(", ")],
];

const LABEL_WIDTH = Math.max(...ROWS.map(([label]) => `${label}: `.length));

/** The parameters `testCase` names, one line each. */
export function renderSummary(testCase: TestCaseDeclaration): string {
  return ROWS.map(([label, values]) => `${`${label}:`.padEnd(LABEL_WIDTH)}${values(testCase)}`).join("\n");
}

/** The matrix's shape, then each permutation, numbered from 1, with its abbreviated hash. */
export function renderMatrix(testCase: TestCaseDeclaration, permutations: HashedPermutation[]): string {
  const count = permutations.length;
  const shape = `Matrix shape: ${matrixShape(testCase).join("/")} (${count} ${count === 1 ? "permutation" : "permutations"})`;
  const indexWidth = Math.max(2, String(count).length);
  const widths = AXES.map((axis) => Math.max(...permutations.map((permutation) => permutation[axis].length)));
  const rows = permutations.map((permutation, i) => {
    const columns = AXES.map((axis, a) => permutation[axis].padEnd(widths[a] as number)).join(" | ");
    return `${String(i + 1).padStart(indexWidth)}  ${columns}   ${abbreviateHash(permutation.hash)}`;
  });
  return [shape, "", ...rows].join("\n");
}

/** The plan of test case `name`, of the nearest `.thunderjar/` folder, in `cwd` or above it. */
export async function plan(cwd: string, name: string): Promise<string> {
  const root = await findThunderjarRoot(cwd);
  const testCase = await loadTestCase(root, name);
  const permutations = await hashPermutations(root, testCase);
  return `${renderSummary(testCase)}\n\n${renderMatrix(testCase, permutations)}`;
}

export function createPlanCommand(): Command {
  return new Command("plan")
    .description("Show what a test case would run, without running it: the parameters it names, and each permutation of them with its hash.")
    .argument("<test case>", `the name of a test case, declared in ${FOLDER}/test-cases/<test case>.ts`)
    .action(
      reportingConfigErrors(async (name: string) => {
        console.log(await plan(process.cwd(), name));
      }),
    );
}
