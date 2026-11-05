// A test case's matrix: the cross product of its five parameter arrays, each permutation with a
// content hash. The hash changes whenever what runs changes: a file of a parameter's declaration,
// the chosen harness version's entry, or the model ID the harness resolves the model to.
import { CryptoHasher, Glob } from "bun";
import type { TestCaseDeclaration } from "../api/declarations.ts";
import { PARAMETERS } from "./folders.ts";
import { loadDeclaration, type Problem, problemsError } from "./loader.ts";

/** The matrix axes, in declaration field order. `task` is a single value, not an axis. */
export const AXES = ["baseImage", "codeState", "promptSet", "harnessModel", "initialPrompt"] as const;

export type Axis = (typeof AXES)[number];

/** One combination of the test case's parameters, by name. */
export type Permutation = Record<Axis, string>;

export type HashedPermutation = Permutation & {
  /** SHA-256 hex digest. Compare with this; show `abbreviateHash(hash)`. */
  hash: string;
  /**
   * Each parameter's own hash, from its content. `harnessModel`'s is the harness's, with the
   * chosen version's entry: the model is `modelId`.
   */
  parameterHashes: Record<Axis, string>;
  /** The model ID the harness model pair resolves to. */
  modelId: string;
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

/** Harness files hashed by their resolved value, not by content, so adding a model or version changes no hash. */
const HARNESS_MAPS = new Set(["models.ts", "versions.ts"]);

/**
 * Every file under `dir`, as its path relative to `dir`. Symlinks are followed, so a linked
 * file or folder counts under the link's own path. A link back to a folder already being walked
 * is skipped, and a dangling link is listed with no content.
 */
async function walk(dir: string, prefix = "", ancestors = new Set<string>()): Promise<{ file: string; dangling?: true }[]> {
  const { dev, ino } = await Bun.file(dir).stat();
  const id = `${dev}:${ino}`;
  if (ancestors.has(id)) return [];
  const within = new Set([...ancestors, id]);
  const entries = [...new Glob("*").scanSync({ cwd: dir, onlyFiles: false, dot: true })];
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const stat = await Bun.file(`${dir}/${entry}`)
        .stat()
        .catch(() => undefined);
      if (!stat) return [{ file: `${prefix}${entry}`, dangling: true as const }];
      if (stat.isDirectory()) return walk(`${dir}/${entry}`, `${prefix}${entry}/`, within);
      return [{ file: `${prefix}${entry}` }];
    }),
  );
  return nested.flat();
}

/**
 * Each file under `<root>/<path>` (a folder, or a single file), as `[path within it, sha256]`,
 * sorted by path. The folder's own name is left out, so renaming it keeps its content. A
 * symlink's target content is hashed, so editing a shared file it links to changes the hash.
 */
async function contentOf(root: string, path: string, exclude = new Set<string>()): Promise<[string, string | null][]> {
  if (!path.endsWith("/")) return [["", sha256(await Bun.file(`${root}/${path}`).arrayBuffer())]];
  const files = (await walk(`${root}/${path}`)).filter(({ file }) => !exclude.has(file)).toSorted((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  return Promise.all(
    files.map(async ({ file, dangling }): Promise<[string, string | null]> => [
      file,
      dangling ? null : sha256(await Bun.file(`${root}/${path}${file}`).arrayBuffer()),
    ]),
  );
}

/** A harness model pair `harness@version/model`, split into its parts. */
export function parsePair(pair: string): { harness: string; version: string; model: string } {
  const at = pair.indexOf("@");
  const slash = pair.indexOf("/", at);
  return { harness: pair.slice(0, at), version: pair.slice(at + 1, slash), model: pair.slice(slash + 1) };
}

/** Where a folder axis's declaration lives, relative to `.thunderjar/`. */
const FOLDERS = {
  baseImage: "baseImages",
  codeState: "codeStates",
  promptSet: "promptSets",
} as const;

/**
 * Every permutation of `testCase`, a validated test case of `root` (the `.thunderjar/` folder),
 * with its hash.
 *
 * Each parameter hash comes from the content of its declaration, never its name. A harness's
 * `models.ts` and `versions.ts` are left out of its content; the chosen version's entry is
 * hashed with the harness instead, and the model ID the pair resolves to joins the permutation
 * hash. A task's `measurements/` are never hashed.
 */
export async function hashPermutations(root: string, testCase: TestCaseDeclaration): Promise<HashedPermutation[]> {
  const cache = new Map<string, Promise<string>>();
  const cached = (key: string, compute: () => Promise<string>) => {
    if (!cache.has(key)) cache.set(key, compute());
    return cache.get(key) as Promise<string>;
  };
  const problems: Problem[] = [];

  const folderHash = (axis: keyof typeof FOLDERS, name: string) =>
    cached(`${axis}\0${name}`, async () => sha256(JSON.stringify(await contentOf(root, `${PARAMETERS}/${FOLDERS[axis]}/${name}/`))));

  const initialPromptHash = (name: string) =>
    cached(`initialPrompt\0${name}`, async () =>
      sha256(JSON.stringify(await contentOf(root, `${PARAMETERS}/tasks/${testCase.task}/initial-prompts/${name}.ts`))),
    );

  const harnessMap = async (harness: string, file: string, declareFn: string) =>
    (await loadDeclaration(root, `${PARAMETERS}/harnessModels/${harness}/${file}`, declareFn, problems)) as
      | Record<string, unknown>
      | undefined;

  const harnessHash = (pair: string) => {
    const { harness, version } = parsePair(pair);
    return cached(`harness\0${harness}@${version}`, async () => {
      const files = await contentOf(root, `${PARAMETERS}/harnessModels/${harness}/`, HARNESS_MAPS);
      const versions = await harnessMap(harness, "versions.ts", "declareHarnessVersions");
      return sha256(JSON.stringify({ files, version: versions?.[version] }));
    });
  };

  const modelId = (pair: string) => {
    const { harness, model } = parsePair(pair);
    return cached(`model\0${harness}/${model}`, async () => String((await harnessMap(harness, "models.ts", "declareHarnessModels"))?.[model]));
  };

  const permutations = await Promise.all(
    expandPermutations(testCase).map(async (permutation) => {
      const parts = await Promise.all([
        folderHash("baseImage", permutation.baseImage),
        folderHash("codeState", permutation.codeState),
        folderHash("promptSet", permutation.promptSet),
        harnessHash(permutation.harnessModel),
        initialPromptHash(permutation.initialPrompt),
        modelId(permutation.harnessModel),
      ]);
      const [baseImage, codeState, promptSet, harnessModel, initialPrompt, model] = parts;
      return {
        ...permutation,
        hash: sha256(JSON.stringify(parts)),
        parameterHashes: { baseImage, codeState, promptSet, harnessModel, initialPrompt },
        modelId: model,
      };
    }),
  );
  if (problems.length > 0) throw problemsError(problems);
  return permutations;
}
