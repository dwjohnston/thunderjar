// A test case's matrix: the cross product of its five parameter arrays, each permutation with a
// content hash. The hash changes whenever anything that defines the permutation changes: a
// parameter's name, a file in its declaration folder, or the harness model.
import { CryptoHasher, Glob } from "bun";
import type { TestCaseDeclaration } from "../api/declarations.ts";
import { PARAMETERS } from "./folders.ts";

/** The matrix axes, in declaration field order. `task` is a single value, not an axis. */
export const AXES = ["baseImage", "codeState", "promptSet", "harnessModel", "initialPrompt"] as const;

export type Axis = (typeof AXES)[number];

/** One combination of the test case's parameters, by name. */
export type Permutation = Record<Axis, string>;

export type HashedPermutation = Permutation & {
  /** SHA-256 hex digest. Compare with this; show `abbreviateHash(hash)`. */
  hash: string;
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

const sha256 = (data: string | ArrayBuffer) => new CryptoHasher("sha256").update(data).digest("hex");

/** Each file under `<root>/<path>` (a folder, or a single file), as `[relative path, sha256]`, sorted by path. */
async function contentOf(root: string, path: string): Promise<[string, string][]> {
  if (!path.endsWith("/")) return [[path, sha256(await Bun.file(`${root}/${path}`).arrayBuffer())]];
  const files = [...new Glob("**/*").scanSync({ cwd: `${root}/${path}`, onlyFiles: true, dot: true })].toSorted();
  return Promise.all(
    files.map(async (file): Promise<[string, string]> => [file, sha256(await Bun.file(`${root}/${path}${file}`).arrayBuffer())]),
  );
}

/** Where each axis's declaration lives, relative to `.thunderjar/`. */
function declarationOf(axis: Axis, name: string, task: string): string {
  switch (axis) {
    case "baseImage":
      return `${PARAMETERS}/baseImages/${name}/`;
    case "codeState":
      return `${PARAMETERS}/codeStates/${name}/`;
    case "promptSet":
      return `${PARAMETERS}/promptSets/${name}/`;
    case "harnessModel":
      return `${PARAMETERS}/harnessModels/${name.split("@")[0]}/`;
    case "initialPrompt":
      return `${PARAMETERS}/tasks/${task}/initial-prompts/${name}.ts`;
  }
}

/**
 * Every permutation of `testCase`, a validated test case of `root` (the `.thunderjar/` folder),
 * with its hash.
 */
export async function hashPermutations(root: string, testCase: TestCaseDeclaration): Promise<HashedPermutation[]> {
  const parameterHashes = new Map<string, Promise<string>>();
  const parameterHash = (axis: Axis, name: string) => {
    const key = `${axis}\0${name}`;
    if (!parameterHashes.has(key)) {
      const files = contentOf(root, declarationOf(axis, name, testCase.task));
      parameterHashes.set(key, files.then((files) => sha256(JSON.stringify({ axis, name, files }))));
    }
    return parameterHashes.get(key) as Promise<string>;
  };

  return Promise.all(
    expandPermutations(testCase).map(async (permutation) => {
      const hashes = await Promise.all(AXES.map((axis) => parameterHash(axis, permutation[axis])));
      return { ...permutation, hash: sha256(JSON.stringify(hashes)) };
    }),
  );
}
