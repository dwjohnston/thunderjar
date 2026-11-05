// Each permutation's hashes, from what its parameters output, never from their source: the
// fragment each renders, and the files it can copy into the image, so editing a comment changes
// nothing, and a parameter's hash changes only when what it builds or runs does.
//
//   base image, code state, prompt set   fragment, `files/`, and the base image's runOptions
//   harness                               fragment (with its version), `cli` rendered with fixed
//                                         sample values, `requiredEnv`, and `files/`
//   initial prompt                        fragment, its prompt or turns, and `timeoutSeconds`
//
// A parameter's `resolve` runs first, once per execution, and its result reaches the hash only
// through the text it ends up in.
//
// The permutation hash, which identifies runs, is of every parameter hash and the model ID. The
// prerun image hash is of what the image is built from alone: its Dockerfile and each folder
// parameter's `files/`, so two models of one harness share an image.
import { $, CryptoHasher, Glob } from "bun";
import type {
  BaseImageDeclaration,
  CodeStateDeclaration,
  HarnessCliCtx,
  HarnessDeclaration,
  InitialPromptDeclaration,
  PromptSetDeclaration,
  Resolved,
  ResolveCtx,
  TestCaseDeclaration,
} from "../api/declarations.ts";
import { FILES, PARAMETERS } from "../config/folders.ts";
import { ConfigError, existsIn, loadDeclaration, type Problem, problemsError } from "../config/loader.ts";
import { AXES, type Axis, expandPermutations, type HashedPermutation, parsePair } from "../config/permutations.ts";
import { type Ctxs, type FolderRole, joinFragments, PARAMETER_DIRS, renderFragment, type Role } from "./prerunDockerfile.ts";

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

/** Runs a command on the host, as `ctx.exec` does: see ResolveCtx. */
export type Exec = ResolveCtx["exec"];

/**
 * The root of the git repository `root` (the `.thunderjar/` folder) is in, the nearest folder above
 * it with a `.git`, or the project's folder outside one. Found without running git, which a test may fake.
 */
async function repositoryRoot(root: string): Promise<string> {
  const project = root.slice(0, root.lastIndexOf("/")) || "/";
  for (let dir = project; ; dir = dir.slice(0, dir.lastIndexOf("/")) || "/") {
    if (await Bun.file(`${dir}/.git`).stat().then(() => true, () => false)) return dir;
    if (dir === "/") return project;
  }
}

/** `ctx.exec` on the host: `sh -c command` in `cwd`, its stdout trimmed, throwing on a non-zero exit. */
export function hostExec(cwd: string): Exec {
  return async (command) => {
    const result = await $`sh -c ${command}`.cwd(cwd).quiet().nothrow();
    if (result.exitCode === 0) return result.stdout.toString().trim();
    const stderr = result.stderr.toString().trim();
    throw new Error(`\`${command}\` exited with ${result.exitCode}${stderr ? `: ${stderr}` : ""}`);
  };
}

/** Whether `value` is something `resolve` may return: what JSON can hold. */
function isResolved(value: unknown): value is Resolved {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isResolved);
  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.values(value).every(isResolved);
}

const ROLE_NAMES: Record<Axis, string> = {
  baseImage: "base image",
  codeState: "code state",
  promptSet: "prompt set",
  harnessModel: "harness",
  initialPrompt: "initial prompt",
};

type Resolvable = { config?: unknown; resolve?: (config: unknown, ctx: ResolveCtx) => unknown };

/** One parameter of a permutation, loaded: where it's declared, and its declaration. */
type Parameter<D> = { key: string; label: string; file: string; dir?: string; declaration: D };

export type HashOptions = {
  /** Runs `ctx.exec`'s commands. By default, on the host, in the repository's root. */
  exec?: Exec;
};

/**
 * Every permutation of `testCase`, a test case of `root` (the `.thunderjar/` folder) already
 * checked by `loadTestCase`, with its hashes, prerun Dockerfile, and what its parameters resolved
 * to. Each parameter is loaded, resolved and rendered once, however many permutations name it.
 * Every `resolve` runs first: if one throws, or returns what JSON can't hold, nothing is rendered.
 * Throws a ConfigError naming each parameter whose `resolve` fails, or each declaration whose
 * fragment, or harness `cli`, can't be rendered.
 */
export async function hashPermutations(root: string, testCase: TestCaseDeclaration, options: HashOptions = {}): Promise<HashedPermutation[]> {
  const problems: Problem[] = [];
  const cache = new Map<string, Promise<unknown>>();
  const once = <T>(key: string, compute: () => Promise<T>): Promise<T> => {
    if (!cache.has(key)) cache.set(key, compute());
    return cache.get(key) as Promise<T>;
  };
  const load = <D>(file: string, declareFn: string) => once(`load\0${file}`, async () => (await loadDeclaration(root, file, declareFn, problems)) as D | undefined);

  // Loading: each permutation's parameters, from their declarations.
  const folderParameter = async (axis: FolderAxis, name: string) => {
    const [folder, declareFn] = FOLDERS[axis];
    const dir = `${PARAMETERS}/${folder}/${name}`;
    const file = `${dir}/index.ts`;
    const declaration = await load<BaseImageDeclaration | CodeStateDeclaration | PromptSetDeclaration>(file, declareFn);
    return declaration && { key: `${axis}\0${name}`, label: `${ROLE_NAMES[axis]} ${JSON.stringify(name)}`, file, dir, declaration };
  };
  const harnessParameter = async (pair: string) => {
    const { harness: name, modelId } = parsePair(pair);
    const dir = `${PARAMETERS}/harnessModels/${name}`;
    const file = `${dir}/index.ts`;
    const declaration = await load<HarnessDeclaration>(file, "declareHarness");
    if (!declaration) return undefined;
    return {
      key: `harnessModel\0${name}`,
      label: `${ROLE_NAMES.harnessModel} ${JSON.stringify(name)}`,
      file,
      dir,
      declaration,
      version: declaration.version,
      modelId,
    };
  };
  const initialPromptParameter = async (name: string) => {
    const file = `${PARAMETERS}/tasks/${testCase.task}/initial-prompts/${name}.ts`;
    const declaration = await load<InitialPromptDeclaration>(file, "declareInitialPrompt");
    return declaration && { key: `initialPrompt\0${name}`, label: `${ROLE_NAMES.initialPrompt} ${JSON.stringify(name)}`, file, declaration };
  };

  const loaded = [];
  for (const permutation of expandPermutations(testCase)) {
    loaded.push({
      permutation,
      baseImage: await folderParameter("baseImage", permutation.baseImage),
      codeState: await folderParameter("codeState", permutation.codeState),
      promptSet: await folderParameter("promptSet", permutation.promptSet),
      harnessModel: await harnessParameter(permutation.harnessModel),
      initialPrompt: await initialPromptParameter(permutation.initialPrompt),
    });
  }
  if (problems.length > 0) throw problemsError(problems);

  // Resolving: each parameter's `resolve`, once, in plan's order, before anything is rendered.
  const exec = options.exec ?? hostExec(await repositoryRoot(root));
  const resolved = new Map<string, Resolved | undefined>();
  const failures: string[] = [];
  for (const parameters of loaded) {
    for (const axis of AXES) {
      const { key, label, declaration } = parameters[axis] as Parameter<Resolvable>;
      if (resolved.has(key)) continue;
      resolved.set(key, undefined);
      if (declaration.resolve === undefined) continue;
      try {
        const value = await declaration.resolve(declaration.config, { exec });
        if (isResolved(value)) resolved.set(key, value);
        else failures.push(`${label}: resolve must return a string, number, boolean or null, or a list or object of them, got ${value === undefined ? "undefined" : typeof value}.`);
      } catch (error) {
        failures.push(`${label}: resolve threw: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  if (failures.length > 0) throw new ConfigError(...failures);

  // Rendering: each parameter's fragment, once, with what it resolved to, and its hash.
  const rendered = new Map<string, Promise<Rendered | undefined>>();
  const render = (parameter: Parameter<object> & { version?: string }, role: Role, hashed: (fragment: string) => Promise<Rendered | undefined>) => {
    const done = rendered.get(parameter.key);
    if (done) return done;
    const resolvedValue = resolved.get(parameter.key);
    const ctx = {
      ...(parameter.dir !== undefined && { dir: PARAMETER_DIRS[role as FolderRole] }),
      ...(parameter.version !== undefined && { version: parameter.version }),
      resolved: resolvedValue,
    } as Ctxs[Role] & { resolved: unknown };
    const fragment = renderFragment(role, parameter, ctx, problems);
    const result = fragment === undefined ? Promise.resolve(undefined) : hashed(fragment);
    rendered.set(parameter.key, result);
    return result;
  };

  const folder = (axis: FolderAxis, parameter: Parameter<BaseImageDeclaration | CodeStateDeclaration | PromptSetDeclaration>) =>
    render(parameter, axis, async (fragment) => {
      const files = await filesOf(root, parameter.dir as string);
      const runOptions = axis === "baseImage" ? { runOptions: (parameter.declaration as BaseImageDeclaration).runOptions ?? [] } : {};
      return { fragment, files, hash: sha256(JSON.stringify({ fragment, files, ...runOptions })) };
    });

  const harness = (parameter: Parameter<HarnessDeclaration> & { version: string }) =>
    render(parameter, "harness", async (fragment) => {
      let cli: string[];
      try {
        const resolvedValue = resolved.get(parameter.key);
        cli = [0, 1].map((turn) => String(parameter.declaration.cli({ ...SAMPLE_CLI, version: parameter.version, turn, resolved: resolvedValue })));
      } catch (error) {
        problems.push({ file: parameter.file, field: "cli", message: `threw: ${error instanceof Error ? error.message : String(error)}` });
        return undefined;
      }
      const files = await filesOf(root, parameter.dir as string);
      return { fragment, files, hash: sha256(JSON.stringify({ fragment, cli, requiredEnv: parameter.declaration.requiredEnv ?? [], files })) };
    });

  const initialPrompt = (parameter: Parameter<InitialPromptDeclaration>) =>
    render(parameter, "initialPrompt", async (fragment) => {
      const { prompt, turns, timeoutSeconds } = parameter.declaration;
      return { fragment, files: [], hash: sha256(JSON.stringify({ fragment, prompt, turns, timeoutSeconds })) };
    });

  // One after another, so problems are listed in plan's order.
  const permutations: HashedPermutation[] = [];
  for (const parameters of loaded) {
    const { permutation } = parameters;
    const harnessModel = parameters.harnessModel as NonNullable<typeof parameters.harnessModel>;
    const baseImage = await folder("baseImage", parameters.baseImage as Parameter<BaseImageDeclaration>);
    const codeState = await folder("codeState", parameters.codeState as Parameter<CodeStateDeclaration>);
    const promptSet = await folder("promptSet", parameters.promptSet as Parameter<PromptSetDeclaration>);
    const harnessRendered = await harness(harnessModel);
    const prompt = await initialPrompt(parameters.initialPrompt as Parameter<InitialPromptDeclaration>);
    if (!baseImage || !codeState || !promptSet || !harnessRendered || !prompt) continue;
    const parameterHashes = {
      baseImage: baseImage.hash,
      codeState: codeState.hash,
      promptSet: promptSet.hash,
      harnessModel: harnessRendered.hash,
      initialPrompt: prompt.hash,
    };
    const dockerfile = joinFragments({
      baseImage: baseImage.fragment,
      codeState: codeState.fragment,
      promptSet: promptSet.fragment,
      harness: harnessRendered.fragment,
      initialPrompt: prompt.fragment,
    });
    const files = { baseImage: baseImage.files, codeState: codeState.files, promptSet: promptSet.files, harness: harnessRendered.files };
    const resolvedValues: Partial<Record<Axis, Resolved>> = {};
    for (const axis of AXES) {
      const value = resolved.get((parameters[axis] as Parameter<object>).key);
      if (value !== undefined) resolvedValues[axis] = value;
    }
    permutations.push({
      ...permutation,
      hash: sha256(JSON.stringify({ parameterHashes, modelId: harnessModel.modelId })),
      parameterHashes,
      modelId: harnessModel.modelId,
      imageHash: sha256(JSON.stringify({ dockerfile, files })),
      dockerfile,
      resolved: resolvedValues,
    });
  }
  if (problems.length > 0) throw problemsError(problems);
  return permutations;
}
