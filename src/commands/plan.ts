// `thunderjar plan <test case>` — spec/100-cli-reference.md#plan,
// spec/055-declaring-test-cases.md#declaration. Lists the parameters a test case names with
// their parameter hashes, then its matrix shape, container run count, and each permutation
// with its prerun image. Whether that image exists is a later story.

import { join } from "node:path";
import { findThunderjarRoot, loadTestCase, parseHarnessModelPair } from "../config.ts";
import {
  abbreviateHash,
  hashBaseImage,
  hashCodeState,
  hashHarnessModelPair,
  hashInitialPrompt,
  hashPermutation,
  hashPromptSet,
} from "../hashing.ts";
import { AXES, expandPermutations, matrixShape } from "../permutations.ts";
import { prerunTag } from "../tags.ts";

type Axis = (typeof AXES)[number];

/** The parameter lines, in declaration field order. `task` has no hash of its own. */
const LABELS = ["baseImage", "codeState", "promptSet", "harnessModel", "task", "initialPrompt"] as const;

const LABEL_WIDTH = Math.max(...LABELS.map((label) => label.length)) + 2; // + ":" + one space

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

export async function plan(name: string, cwd: string = process.cwd()): Promise<string> {
  const root = findThunderjarRoot(cwd);
  const testCase = await loadTestCase(root, name);

  // The full parameter hash of every name the test case selects, per axis.
  const parameters = join(root, "test-case-parameters");
  const hashParameter: Record<Axis, (name: string) => string | Promise<string>> = {
    baseImage: (n) => hashBaseImage(join(parameters, "baseImages", n)),
    codeState: (n) => hashCodeState(join(parameters, "codeStates", n)),
    promptSet: (n) => hashPromptSet(join(parameters, "promptSets", n)),
    harnessModel: (n) => {
      const { family, version, model } = parseHarnessModelPair(n)!; // checked by loadTestCase
      return hashHarnessModelPair(join(parameters, "harnessModels", family), version, model);
    },
    initialPrompt: (n) => hashInitialPrompt(join(parameters, "tasks", testCase.task, "initial-prompts", `${n}.ts`)),
  };
  const hashes = {} as Record<Axis, Map<string, string>>;
  for (const axis of AXES) {
    hashes[axis] = new Map();
    for (const n of testCase[axis]) hashes[axis].set(n, await hashParameter[axis](n));
  }

  const parameterLines = LABELS.map((label) => {
    const value =
      label === "task"
        ? testCase.task
        : testCase[label].map((n) => `${n} (${abbreviateHash(hashes[label].get(n)!)})`).join(", ");
    return `${(label + ":").padEnd(LABEL_WIDTH)}${value}`;
  });

  const permutations = expandPermutations(testCase);
  const runs = permutations.length * testCase.iterations;
  const summary =
    `Matrix shape: ${matrixShape(testCase).join("/")} ` +
    `(${count(permutations.length, "permutation")} × ${count(testCase.iterations, "iteration")} = ${count(runs, "container run")})`;

  // Each permutation: a right-aligned number, then the five names as columns, each padded to
  // its widest value (the last isn't padded); below, its prerun image, which carries the
  // permutation hash.
  const cells = permutations.map((p) => AXES.map((axis) => p[axis]));
  const widths = AXES.map((_, i) => Math.max(...cells.map((row) => row[i]!.length)));
  const numberWidth = Math.max(2, String(permutations.length).length);
  const entries = permutations.map((permutation, n) => {
    const columns = cells[n]!.map((cell, i) => (i === AXES.length - 1 ? cell : cell.padEnd(widths[i]!)));
    const hash = hashPermutation({
      baseImage: hashes.baseImage.get(permutation.baseImage)!,
      codeState: hashes.codeState.get(permutation.codeState)!,
      promptSet: hashes.promptSet.get(permutation.promptSet)!,
      harnessModel: hashes.harnessModel.get(permutation.harnessModel)!,
      initialPrompt: hashes.initialPrompt.get(permutation.initialPrompt)!,
    });
    return (
      `${String(n + 1).padStart(numberWidth)}  ${columns.join(" | ")}\n` +
      `${" ".repeat(numberWidth + 2)}${prerunTag(hash)}`
    );
  });

  return [...parameterLines, "", summary, "", entries.join("\n\n")].join("\n");
}
