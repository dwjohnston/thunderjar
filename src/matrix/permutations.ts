// Expanding a test case into its permutations — spec/055-declaring-test-cases.md#a-test-case-is-a-matrix.
// The five parameter arrays form a cross product, listed in a stable order: the arrays are
// walked in declaration field order, with the last varying fastest. That is a listing
// order, not an execution order.

import type { TestCaseDeclaration } from "../api/declarations.ts";

/** One combination of the five test case parameters, by name. */
export interface Permutation {
  baseImage: BaseImageName;
  codeState: CodeStateName;
  promptSet: PromptSetName;
  harnessModel: HarnessModelName;
  initialPrompt: string;
}

/** The five matrix axes, in declaration field order. `task` is a single value, not an axis. */
export const AXES = ["baseImage", "codeState", "promptSet", "harnessModel", "initialPrompt"] as const;

/**
 * The size of each axis, written `1/1/2/2/2` — spec/030-terminology.md#matrix-shape.
 * Their product is the number of permutations.
 */
export function matrixShape(testCase: TestCaseDeclaration): number[] {
  return AXES.map((axis) => testCase[axis].length);
}

/** Every permutation of `testCase`, in the stable listing order. */
export function expandPermutations(testCase: TestCaseDeclaration): Permutation[] {
  const permutations: Permutation[] = [];
  for (const baseImage of testCase.baseImage)
    for (const codeState of testCase.codeState)
      for (const promptSet of testCase.promptSet)
        for (const harnessModel of testCase.harnessModel)
          for (const initialPrompt of testCase.initialPrompt)
            permutations.push({ baseImage, codeState, promptSet, harnessModel, initialPrompt });
  return permutations;
}

/**
 * Each permutation's five names as columns joined by ` | `, each padded to its widest value
 * across `permutations` (the last isn't padded), so the rows line up.
 */
export function permutationRows(permutations: Permutation[]): string[] {
  const cells = permutations.map((p) => AXES.map((axis) => p[axis]));
  const widths = AXES.map((_, i) => Math.max(...cells.map((row) => row[i]!.length)));
  return cells.map((row) =>
    row.map((cell, i) => (i === AXES.length - 1 ? cell : cell.padEnd(widths[i]!))).join(" | "),
  );
}
