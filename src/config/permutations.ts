// A test case's matrix: the cross product of its five parameter arrays. Each permutation's hashes
// are from what its parameters output: see src/execution/hashPermutations.ts.
import type { TestCaseDeclaration } from "../api/declarations.ts";

/** The matrix axes, in declaration field order. `task` is a single value, not an axis. */
export const AXES = ["baseImage", "codeState", "promptSet", "harnessModel", "initialPrompt"] as const;

export type Axis = (typeof AXES)[number];

/** One combination of the test case's parameters, by name. */
export type Permutation = Record<Axis, string>;

export type HashedPermutation = Permutation & {
  /**
   * The permutation hash, which identifies its runs: of every parameter hash, and the model ID.
   * SHA-256 hex digest. Compare with this; show `abbreviateHash(hash)`.
   */
  hash: string;
  /**
   * Each parameter's own hash, from what it outputs. `harnessModel`'s is the harness's: the model
   * is `modelId`.
   */
  parameterHashes: Record<Axis, string>;
  /** The model ID the harness model pair resolves to. */
  modelId: string;
  /**
   * The prerun image hash: of its Dockerfile and each folder parameter's `files/`, and nothing
   * else, so permutations that build the same image share it, e.g. two models of one harness.
   */
  imageHash: string;
  /** Its prerun Dockerfile. */
  dockerfile: string;
};

/** The size of each axis, e.g. `[1, 1, 2, 2, 2]`. Their product is the number of permutations. */
export function matrixShape(testCase: TestCaseDeclaration): number[] {
  return AXES.map((axis) => testCase[axis].length);
}

/** Every permutation of `testCase`, the last axis varying fastest. */
export function expandPermutations(testCase: TestCaseDeclaration): Permutation[] {
  return AXES.reduce<Partial<Permutation>[]>(
    (permutations, axis) => permutations.flatMap((partial) => testCase[axis].map((name) => ({ ...partial, [axis]: name }))),
    [{}],
  ) as Permutation[];
}

/** The abbreviation `plan` shows and image tags carry. */
export const abbreviateHash = (hash: string) => hash.slice(0, 8);

/** A harness model pair `harness@version/model`, split into its parts. */
export function parsePair(pair: string): { harness: string; version: string; model: string } {
  const at = pair.indexOf("@");
  const slash = pair.indexOf("/", at);
  return { harness: pair.slice(0, at), version: pair.slice(at + 1, slash), model: pair.slice(slash + 1) };
}
