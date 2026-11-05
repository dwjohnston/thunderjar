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
import { DockerUnavailableError, imagesIn } from "../../../docker/docker.ts";
import { prerunImage, prerunRepository } from "../../../execution/images.ts";
import { reportingConfigErrors } from "../../configErrors.ts";
import { imagePrefixOption } from "../../imagePrefix.ts";

/** Whether a permutation's prerun image exists: `unknown` when Docker can't be asked. */
export type ImageStatus = "built" | "missing" | "unknown";

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

/** The matrix's shape, then each permutation, numbered from 1, with its abbreviated hash and image status. */
export function renderMatrix(
  testCase: TestCaseDeclaration,
  permutations: HashedPermutation[],
  statuses: ImageStatus[],
): string {
  const count = permutations.length;
  const shape = `Matrix shape: ${matrixShape(testCase).join("/")} (${count} ${count === 1 ? "permutation" : "permutations"})`;
  const indexWidth = Math.max(2, String(count).length);
  const widths = AXES.map((axis) => Math.max(...permutations.map((permutation) => permutation[axis].length)));
  const rows = permutations.map((permutation, i) => {
    const columns = AXES.map((axis, a) => permutation[axis].padEnd(widths[a] as number)).join(" | ");
    return `${String(i + 1).padStart(indexWidth)}  ${columns}   ${abbreviateHash(permutation.hash)}  ${statuses[i]}`;
  });
  return [shape, "", ...rows].join("\n");
}

/** Whether each permutation's prerun image exists, or, if Docker can't be asked, why not. */
async function imageStatuses(
  permutations: HashedPermutation[],
  imagePrefix?: string,
): Promise<{ statuses: ImageStatus[]; unavailable?: string }> {
  try {
    const images = await imagesIn(prerunRepository(imagePrefix));
    return { statuses: permutations.map((p) => (images.has(prerunImage(p.hash, imagePrefix)) ? "built" : "missing")) };
  } catch (error) {
    if (!(error instanceof DockerUnavailableError)) throw error;
    return { statuses: permutations.map(() => "unknown"), unavailable: error.message };
  }
}

/**
 * The plan of test case `name`, of the nearest `.thunderjar/` folder, in `cwd` or above it, and a
 * warning if Docker couldn't say which prerun images exist.
 */
export async function plan(cwd: string, name: string, imagePrefix?: string): Promise<{ output: string; warning?: string }> {
  const root = await findThunderjarRoot(cwd);
  const testCase = await loadTestCase(root, name);
  const permutations = await hashPermutations(root, testCase);
  const { statuses, unavailable } = await imageStatuses(permutations, imagePrefix);
  return {
    output: `${renderSummary(testCase)}\n\n${renderMatrix(testCase, permutations, statuses)}`,
    warning: unavailable && `Warning: Docker can't be reached, so whether each prerun image is built is unknown: ${unavailable}`,
  };
}

export function createPlanCommand(): Command {
  return new Command("plan")
    .description(
      "Show what a test case would run, without running it: the parameters it names, each permutation of them with its hash, and whether its prerun image is built.",
    )
    .argument("<test case>", `the name of a test case, declared in ${FOLDER}/test-cases/<test case>.ts`)
    .addOption(imagePrefixOption())
    .action(
      reportingConfigErrors(async (name: string, options: { imagePrefix: string }) => {
        const { output, warning } = await plan(process.cwd(), name, options.imagePrefix);
        console.log(output);
        if (warning) console.error(warning);
      }),
    );
}
