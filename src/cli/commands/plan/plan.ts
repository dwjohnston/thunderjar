import { Command } from "commander";
import type { TestCaseDeclaration } from "../../../api/declarations.ts";
import { FOLDER, findThunderjarRoot } from "../../../config/loader.ts";
import {
  AXES,
  abbreviateHash,
  type HashedPermutation,
  matrixShape,
} from "../../../config/permutations.ts";
import { checkBuildSecrets, loadProjectConfig } from "../../../config/projectConfig.ts";
import { checkRequiredEnv } from "../../../config/requiredEnv.ts";
import { loadTestCase } from "../../../config/testCase.ts";
import { envOf, secretEnvOf } from "../../../config/testCaseEnv.ts";
import { DockerUnavailableError, imagesIn } from "../../../docker/docker.ts";
import { hashPermutations } from "../../../execution/hashPermutations.ts";
import { prerunImage, prerunRepository } from "../../../execution/images.ts";
import { type Paint, painter, plain } from "../../colour.ts";
import { reportingConfigErrors } from "../../configErrors.ts";
import { envEntry, showResolved } from "../../format.ts";
import { imagePrefixOption } from "../../imagePrefix.ts";
import { jsonOption } from "../../json.ts";
import { print, printJson, printWarning } from "../../output.ts";

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

/**
 * The test case's own environment variables, a line each for those it has: `env`, as `NAME=value`,
 * and `secretEnv`, by name only, as its values stay in the shell.
 */
const ENV_ROWS: [label: string, values: (testCase: TestCaseDeclaration) => string[]][] = [
  ["env", (t) => Object.entries(t.env ?? {}).map(([name, value]) => envEntry(name, value))],
  ["secretEnv", (t) => t.secretEnv ?? []],
];

/** The parameters `testCase` names, one line each, then its own environment variables, if it has any. */
export function renderSummary(testCase: TestCaseDeclaration, paint: Paint = plain): string {
  const rows = [
    ...ROWS.map(([label, values]) => [label, values(testCase)] as const),
    ...ENV_ROWS.flatMap(([label, values]) => (values(testCase).length > 0 ? [[label, values(testCase).join(", ")] as const] : [])),
  ];
  return rows.map(([label, value]) => `${paint.dim(`${label}:`.padEnd(LABEL_WIDTH))}${value}`).join("\n");
}

/** An image status, coloured: built green, missing yellow, unknown dim. */
const showStatus = (status: ImageStatus, paint: Paint) =>
  (status === "built" ? paint.green : status === "missing" ? paint.yellow : paint.dim)(status);

/** The matrix's shape, then each permutation, numbered from 1, with its abbreviated hash and image status. */
export function renderMatrix(
  testCase: TestCaseDeclaration,
  permutations: HashedPermutation[],
  statuses: ImageStatus[],
  paint: Paint = plain,
): string {
  const count = permutations.length;
  const shape = `${paint.bold("Matrix shape:")} ${matrixShape(testCase).join("/")} ${paint.dim(`(${count} ${count === 1 ? "permutation" : "permutations"})`)}`;
  const indexWidth = Math.max(2, String(count).length);
  const widths = AXES.map((axis) => Math.max(...permutations.map((permutation) => permutation[axis].length)));
  const rows = permutations.map((permutation, i) => {
    const columns = AXES.map((axis, a) => permutation[axis].padEnd(widths[a] as number)).join(" | ");
    return `${paint.bold(String(i + 1).padStart(indexWidth))}  ${columns}   ${paint.dim(abbreviateHash(permutation.hash))}  ${showStatus(statuses[i]!, paint)}`;
  });
  return [shape, "", ...rows].join("\n");
}

/**
 * What each parameter with a `resolve` resolved to, one line each, `<axis>  <name>  <value>`, in
 * plan's order, or nothing if none has one.
 */
export function renderResolved(permutations: HashedPermutation[], paint: Paint = plain): string[] {
  const rows = new Map<string, [string, string, string]>();
  for (const permutation of permutations) {
    for (const axis of AXES) {
      const value = permutation.resolved[axis];
      if (value !== undefined) rows.set(`${axis}\0${permutation[axis]}`, [axis, permutation[axis], showResolved(value)]);
    }
  }
  if (rows.size === 0) return [];
  const widths = [0, 1].map((i) => Math.max(...[...rows.values()].map((row) => row[i]!.length)));
  return [
    paint.bold("Resolved"),
    ...[...rows.values()].map(([axis, name, value]) => `  ${paint.dim(axis.padEnd(widths[0]!))}  ${name.padEnd(widths[1]!)}  ${paint.cyan(value)}`),
  ];
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

/** A plan as `--json` prints it. */
export type PlanJson = {
  testCase: string;
  /** The parameters the test case names, by axis, and its task. */
  parameters: Pick<TestCaseDeclaration, (typeof AXES)[number] | "task">;
  /** The test case's `env`, with its values, and its `secretEnv`, names only: empty if it has none. */
  env: Record<string, string>;
  secretEnv: string[];
  /** The size of each axis, in the order of `AXES`. */
  matrixShape: number[];
  permutations: {
    /** Numbered from 1, as the text shows them. */
    number: number;
    parameters: Record<(typeof AXES)[number], string>;
    modelId: string;
    /** The permutation hash, in full. */
    hash: string;
    prerunImage: string;
    prerunImageStatus: ImageStatus;
    /** What each of its parameters with a `resolve` resolved to. */
    resolved: HashedPermutation["resolved"];
  }[];
};

/**
 * The plan of test case `name`, of the nearest `.thunderjar/` folder, in `cwd` or above it, as text
 * and as JSON, and a warning if Docker couldn't say which prerun images exist.
 */
export async function plan(
  cwd: string,
  name: string,
  imagePrefix?: string,
  paint: Paint = plain,
): Promise<{ output: string; json: PlanJson; warning?: string }> {
  const root = await findThunderjarRoot(cwd);
  const { build } = await loadProjectConfig(root);
  const testCase = await loadTestCase(root, name);
  await checkRequiredEnv(root, testCase);
  checkBuildSecrets(build);
  const permutations = await hashPermutations(root, testCase);
  const { statuses, unavailable } = await imageStatuses(permutations, imagePrefix);
  const json: PlanJson = {
    testCase: name,
    parameters: {
      baseImage: testCase.baseImage,
      codeState: testCase.codeState,
      promptSet: testCase.promptSet,
      harnessModel: testCase.harnessModel,
      task: testCase.task,
      initialPrompt: testCase.initialPrompt,
    },
    env: envOf(testCase),
    secretEnv: secretEnvOf(testCase),
    matrixShape: matrixShape(testCase),
    permutations: permutations.map((permutation, i) => ({
      number: i + 1,
      parameters: Object.fromEntries(AXES.map((axis) => [axis, permutation[axis]])) as Record<(typeof AXES)[number], string>,
      modelId: permutation.modelId,
      hash: permutation.hash,
      prerunImage: prerunImage(permutation.imageHash, imagePrefix),
      prerunImageStatus: statuses[i]!,
      resolved: permutation.resolved,
    })),
  };
  return {
    json,
    output: [renderSummary(testCase, paint), renderMatrix(testCase, permutations, statuses, paint), renderResolved(permutations, paint).join("\n")]
      .filter(Boolean)
      .join("\n\n"),
    warning: unavailable && `Docker can't be reached, so whether each prerun image is built is unknown: ${unavailable}`,
  };
}

export function createPlanCommand(): Command {
  return new Command("plan")
    .description(
      "Show what a test case would run, without running it: the parameters it names, each permutation of them with its hash, and whether its prerun image is built, then what each parameter with a resolve resolved to.",
    )
    .argument("<test case>", `the name of a test case, declared in ${FOLDER}/test-cases/<test case>.ts`)
    .addOption(imagePrefixOption())
    .addOption(jsonOption())
    .action(
      reportingConfigErrors(async (name: string, options: { imagePrefix: string; json?: boolean }) => {
        const { output, json, warning } = await plan(process.cwd(), name, options.imagePrefix, painter());
        if (options.json) printJson(json);
        else print(output);
        if (warning) printWarning(warning);
      }),
    );
}
