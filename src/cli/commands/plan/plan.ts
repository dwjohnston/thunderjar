import { Command } from "commander";
import type { TestCaseDeclaration } from "../../../api/declarations.ts";
import { FOLDER, findThunderjarRoot } from "../../../config/loader.ts";
import {
  AXES,
  abbreviateHash,
  type HashedPermutation,
  matrixShape,
} from "../../../config/permutations.ts";
import { checkRequiredEnv } from "../../../config/requiredEnv.ts";
import { loadTestCase } from "../../../config/testCase.ts";
import { DockerUnavailableError, imagesIn } from "../../../docker/docker.ts";
import { hashPermutations } from "../../../execution/hashPermutations.ts";
import { prerunImage, prerunRepository } from "../../../execution/images.ts";
import { reportingConfigErrors } from "../../configErrors.ts";
import { showResolved } from "../../format.ts";
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

/**
 * What each parameter with a `resolve` resolved to, one line each, `<axis>  <name>  <value>`, in
 * plan's order, or nothing if none has one.
 */
export function renderResolved(permutations: HashedPermutation[]): string[] {
  const rows = new Map<string, [string, string, string]>();
  for (const permutation of permutations) {
    for (const axis of AXES) {
      const value = permutation.resolved[axis];
      if (value !== undefined) rows.set(`${axis}\0${permutation[axis]}`, [axis, permutation[axis], showResolved(value)]);
    }
  }
  if (rows.size === 0) return [];
  const widths = [0, 1].map((i) => Math.max(...[...rows.values()].map((row) => row[i]!.length)));
  return ["Resolved", ...[...rows.values()].map(([axis, name, value]) => `  ${axis.padEnd(widths[0]!)}  ${name.padEnd(widths[1]!)}  ${value}`)];
}

/** Whether each permutation's prerun image exists, or, if Docker can't be asked, why not. */
async function imageStatuses(
  permutations: HashedPermutation[],
  imagePrefix?: string,
): Promise<{ statuses: ImageStatus[]; unavailable?: string }> {
  try {
    const images = await imagesIn(prerunRepository(imagePrefix));
    return { statuses: permutations.map((p) => (images.has(prerunImage(p.imageHash, imagePrefix)) ? "built" : "missing")) };
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
  await checkRequiredEnv(root, testCase);
  const permutations = await hashPermutations(root, testCase);
  const { statuses, unavailable } = await imageStatuses(permutations, imagePrefix);
  return {
    output: [renderSummary(testCase), renderMatrix(testCase, permutations, statuses), renderResolved(permutations).join("\n")].filter(Boolean).join("\n\n"),
    warning: unavailable && `Warning: Docker can't be reached, so whether each prerun image is built is unknown: ${unavailable}`,
  };
}

export function createPlanCommand(): Command {
  return new Command("plan")
    .description(
      "Show what a test case would run, without running it: the parameters it names, each permutation of them with its hash, and whether its prerun image is built, then what each parameter with a resolve resolved to.",
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
