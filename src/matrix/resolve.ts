// Resolving a loaded test case against its `.thunderjar/` folder: the parameter hash of every
// name it selects, and each permutation with its permutation hash —
// spec/060-test-case-parameters.md#parameter-hashing-and-identity. Shared by `plan` and `run`.

import { join } from "node:path";
import { parseHarnessModelPair } from "../project/config.ts";
import type { TestCaseDeclaration } from "../api/declarations.ts";
import {
  hashBaseImage,
  hashCodeState,
  hashHarnessModelPair,
  hashInitialPrompt,
  hashPermutation,
  hashPromptSet,
} from "./hashing.ts";
import { AXES, expandPermutations, type Permutation } from "./permutations.ts";

export type Axis = (typeof AXES)[number];

/** A permutation with its full permutation hash. */
export interface ResolvedPermutation extends Permutation {
  hash: string;
}

export interface ResolvedTestCase {
  /** The full parameter hash of every name the test case selects, per axis. */
  hashes: Record<Axis, Map<string, string>>;
  /** Every permutation, in the stable listing order. */
  permutations: ResolvedPermutation[];
}

/** Resolves a test case already checked by `loadTestCase`, under the `.thunderjar/` folder `root`. */
export async function resolveTestCase(root: string, testCase: TestCaseDeclaration): Promise<ResolvedTestCase> {
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

  const permutations = expandPermutations(testCase).map((permutation) => ({
    ...permutation,
    hash: hashPermutation({
      baseImage: hashes.baseImage.get(permutation.baseImage)!,
      codeState: hashes.codeState.get(permutation.codeState)!,
      promptSet: hashes.promptSet.get(permutation.promptSet)!,
      harnessModel: hashes.harnessModel.get(permutation.harnessModel)!,
      initialPrompt: hashes.initialPrompt.get(permutation.initialPrompt)!,
    }),
  }));

  return { hashes, permutations };
}
