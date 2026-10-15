// Expanding a test case into its permutations — spec/055-declaring-test-cases.md#a-test-case-is-a-matrix.
// The five parameter arrays form a cross product, listed in a stable order: the arrays are
// walked in declaration field order, with the last varying fastest. That is a listing
// order, not an execution order.

import type { TestCaseDeclaration } from "./declarations.ts";

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
