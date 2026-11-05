// Each permutation's hashes, from what its parameters output, never from their source: the
// fragment each renders, and the files it can copy into the image, so editing a comment changes
// nothing, and a parameter's hash changes only when what it builds or runs does.
//
//   base image, code state, prompt set   fragment, `files/`, and the base image's runOptions
//   harness                               fragment (with its version), `cli` rendered with fixed
//                                         sample values, `requiredEnv`, and `files/`
//   initial prompt                        fragment, its prompt or turns, and `timeoutSeconds`
//
// The permutation hash, which identifies runs, is of every parameter hash and the model ID. The
// prerun image hash is of what the image is built from alone: its Dockerfile and each folder
// parameter's `files/`, so two models of one harness share an image.
import { CryptoHasher, Glob } from "bun";
import type {
  BaseImageDeclaration,
  CodeStateDeclaration,
  HarnessCliCtx,
  HarnessDeclaration,
  HarnessModelsDeclaration,
  HarnessVersionsDeclaration,
  InitialPromptDeclaration,
  PromptSetDeclaration,
  TestCaseDeclaration,
} from "../api/declarations.ts";
import { FILES, PARAMETERS } from "../config/folders.ts";
import { existsIn, loadDeclaration, type Problem, problemsError } from "../config/loader.ts";
import { expandPermutations, type HashedPermutation, parsePair } from "../config/permutations.ts";
import { joinFragments, PARAMETER_DIRS, renderFragment, type Role } from "./prerunDockerfile.ts";

const sha256 = (data: string | ArrayBuffer) => new CryptoHasher("sha256").update(data).digest("hex");

/** A file's path within a `files/` folder, and the SHA-256 of its content, or null for a dangling link. */
type FileHash = [path: string, sha256: string | null];

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
 * Each file in the `files/` folder of the parameter folder `<root>/<dir>`, sorted by path, with
 * its content's hash. None if it has no `files/`. The folder's own name is left out, so renaming
 * it keeps its content. A symlink's target content is hashed, so editing a file it links to
 * changes the hash.
 */
async function filesOf(root: string, dir: string): Promise<FileHash[]> {
  const files = `${dir}/${FILES}/`;
  if (!(await existsIn(root, files))) return [];
  const listed = (await walk(`${root}/${files}`)).toSorted((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  return Promise.all(
    listed.map(async ({ file, dangling }): Promise<FileHash> => [file, dangling ? null : sha256(await Bun.file(`${root}/${files}${file}`).arrayBuffer())]),
  );
}

/** One parameter, rendered: its fragment, its `files/`, and its parameter hash. */
type Rendered = { fragment: string; files: FileHash[]; hash: string };

/** Where each folder axis's declarations are, relative to `test-case-parameters/`, and their declareX(). */
const FOLDERS = {
  baseImage: ["baseImages", "declareBaseImage"],
  codeState: ["codeStates", "declareCodeState"],
  promptSet: ["promptSets", "declarePromptSet"],
} as const;

type FolderAxis = keyof typeof FOLDERS;

/**
 * The fixed values a harness's `cli` is rendered with to hash it: it is hashed by what it does with
 * them, for turn 0 and a later turn, not by the values a container run gets.
 */
const SAMPLE_CLI: Omit<HarnessCliCtx, "version" | "turn"> = {
  modelId: "<modelId>",
  initialPrompt: "<initialPrompt>",
  promptPath: "<promptPath>",
  resultPath: "<resultPath>",
  sessionId: "<sessionId>",
};

/**
 * Every permutation of `testCase`, a test case of `root` (the `.thunderjar/` folder) already
 * checked by `loadTestCase`, with its hashes and prerun Dockerfile. Each parameter is loaded and
 * rendered once, however many permutations name it. Throws a ConfigError naming each declaration
 * whose fragment, or harness `cli`, can't be rendered.
 */
export async function hashPermutations(root: string, testCase: TestCaseDeclaration): Promise<HashedPermutation[]> {
  const problems: Problem[] = [];
  const cache = new Map<string, Promise<unknown>>();
  const once = <T>(key: string, compute: () => Promise<T>): Promise<T> => {
    if (!cache.has(key)) cache.set(key, compute());
    return cache.get(key) as Promise<T>;
  };
  const load = <D>(file: string, declareFn: string) => once(`load\0${file}`, async () => (await loadDeclaration(root, file, declareFn, problems)) as D | undefined);
  const fragmentOf = <R extends Role>(role: R, file: string, declaration: object, ctx: Parameters<typeof renderFragment<R>>[2]) =>
    renderFragment(role, { file, declaration }, ctx, problems);

  const folderParameter = (axis: FolderAxis, name: string) =>
    once(`${axis}\0${name}`, async (): Promise<Rendered | undefined> => {
      const [folder, declareFn] = FOLDERS[axis];
      const dir = `${PARAMETERS}/${folder}/${name}`;
      const file = `${dir}/index.ts`;
      const declaration = await load<BaseImageDeclaration | CodeStateDeclaration | PromptSetDeclaration>(file, declareFn);
      if (!declaration) return undefined;
      const fragment = fragmentOf(axis, file, declaration, { dir: PARAMETER_DIRS[axis] });
      if (fragment === undefined) return undefined;
      const files = await filesOf(root, dir);
      const runOptions = axis === "baseImage" ? { runOptions: (declaration as BaseImageDeclaration).runOptions ?? [] } : {};
      return { fragment, files, hash: sha256(JSON.stringify({ fragment, files, ...runOptions })) };
    });

  const harness = (pair: string) => {
    const { harness: name, version } = parsePair(pair);
    return once(`harness\0${name}@${version}`, async (): Promise<Rendered | undefined> => {
      const dir = `${PARAMETERS}/harnessModels/${name}`;
      const file = `${dir}/index.ts`;
      const [declaration, versions] = [await load<HarnessDeclaration>(file, "declareHarness"), await load<HarnessVersionsDeclaration>(`${dir}/versions.ts`, "declareHarnessVersions")];
      if (!declaration || !versions) return undefined;
      const pinned = (versions[version] as { version: string }).version;
      const fragment = fragmentOf("harness", file, declaration, { dir: PARAMETER_DIRS.harness, version: pinned });
      let cli: string[];
      try {
        cli = [0, 1].map((turn) => String(declaration.cli({ ...SAMPLE_CLI, version: pinned, turn })));
      } catch (error) {
        problems.push({ file, field: "cli", message: `threw: ${error instanceof Error ? error.message : String(error)}` });
        return undefined;
      }
      if (fragment === undefined) return undefined;
      const files = await filesOf(root, dir);
      return { fragment, files, hash: sha256(JSON.stringify({ fragment, cli, requiredEnv: declaration.requiredEnv ?? [], files })) };
    });
  };

  const modelId = (pair: string) => {
    const { harness: name, model } = parsePair(pair);
    return once(`model\0${name}/${model}`, async () => {
      const models = await load<HarnessModelsDeclaration>(`${PARAMETERS}/harnessModels/${name}/models.ts`, "declareHarnessModels");
      return models?.[model];
    });
  };

  const initialPrompt = (name: string) =>
    once(`initialPrompt\0${name}`, async (): Promise<Rendered | undefined> => {
      const file = `${PARAMETERS}/tasks/${testCase.task}/initial-prompts/${name}.ts`;
      const declaration = await load<InitialPromptDeclaration>(file, "declareInitialPrompt");
      if (!declaration) return undefined;
      const fragment = fragmentOf("initialPrompt", file, declaration, {});
      if (fragment === undefined) return undefined;
      const { prompt, turns, timeoutSeconds } = declaration;
      return { fragment, files: [], hash: sha256(JSON.stringify({ fragment, prompt, turns, timeoutSeconds })) };
    });

  // One after another, so problems are listed in plan's order.
  const permutations: HashedPermutation[] = [];
  for (const permutation of expandPermutations(testCase)) {
    const baseImage = await folderParameter("baseImage", permutation.baseImage);
    const codeState = await folderParameter("codeState", permutation.codeState);
    const promptSet = await folderParameter("promptSet", permutation.promptSet);
    const harnessModel = await harness(permutation.harnessModel);
    const prompt = await initialPrompt(permutation.initialPrompt);
    const model = await modelId(permutation.harnessModel);
    if (!baseImage || !codeState || !promptSet || !harnessModel || !prompt || model === undefined) continue;
    const parameterHashes = {
      baseImage: baseImage.hash,
      codeState: codeState.hash,
      promptSet: promptSet.hash,
      harnessModel: harnessModel.hash,
      initialPrompt: prompt.hash,
    };
    const dockerfile = joinFragments({
      baseImage: baseImage.fragment,
      codeState: codeState.fragment,
      promptSet: promptSet.fragment,
      harness: harnessModel.fragment,
      initialPrompt: prompt.fragment,
    });
    const files = { baseImage: baseImage.files, codeState: codeState.files, promptSet: promptSet.files, harness: harnessModel.files };
    permutations.push({
      ...permutation,
      hash: sha256(JSON.stringify({ parameterHashes, modelId: model })),
      parameterHashes,
      modelId: model,
      imageHash: sha256(JSON.stringify({ dockerfile, files })),
      dockerfile,
    });
  }
  if (problems.length > 0) throw problemsError(problems);
  return permutations;
}
