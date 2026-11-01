// A permutation's prerun Dockerfile: each parameter's `applyParameter(config, ctx)` fragment, in
// the order the image is built in:
//
//   base image fragment        must start with FROM
//   WORKDIR /workspace         Thunderjar's only line
//   code state fragment        gets the codebase into /workspace
//   prompt set fragment        puts its prompt files in /workspace
//   harness fragment           installs the agent; ctx.version is the pair's version
//   initial prompt fragment    usually left out: the prompt is used when the harness runs
//
// The build context is a folder Thunderjar assembles for the image. Each folder parameter's
// folder is copied into it at its `ctx.dir`, `PARAMETER_DIRS[role]`, named by role rather than
// by parameter, so the Dockerfile depends on what a parameter contains, never on its name: the
// same as its hash.
import type {
  ApplyParameterCtx,
  BaseImageDeclaration,
  CodeStateDeclaration,
  FragmentCtx,
  HarnessApplyCtx,
  HarnessDeclaration,
  HarnessVersionsDeclaration,
  InitialPromptDeclaration,
  PromptSetDeclaration,
} from "../api/declarations.ts";
import { PARAMETERS } from "../config/folders.ts";
import { loadDeclaration, type Problem, problemsError } from "../config/loader.ts";
import { type Permutation, parsePair } from "../config/permutations.ts";

/** The parameters copied into the build context as folders. */
export type FolderRole = "baseImage" | "codeState" | "promptSet" | "harness";

/** Each folder parameter's `ctx.dir`, relative to the build context. */
export const PARAMETER_DIRS: Record<FolderRole, string> = {
  baseImage: "parameters/baseImage",
  codeState: "parameters/codeState",
  promptSet: "parameters/promptSet",
  harness: "parameters/harness",
};

/** One parameter's declaration, and the file it came from, relative to `.thunderjar/`, for messages. */
type Loaded<D> = { file: string; declaration: D };

/** What a permutation's prerun Dockerfile is rendered from. */
export type PrerunParameters = {
  baseImage: Loaded<BaseImageDeclaration>;
  codeState: Loaded<CodeStateDeclaration>;
  promptSet: Loaded<PromptSetDeclaration>;
  harness: Loaded<HarnessDeclaration> & { version: string };
  initialPrompt: Loaded<InitialPromptDeclaration>;
};

/** The ctx `applyParameter` gets, by parameter. */
type Ctxs = {
  baseImage: ApplyParameterCtx;
  codeState: ApplyParameterCtx;
  promptSet: ApplyParameterCtx;
  harness: HarnessApplyCtx;
  initialPrompt: FragmentCtx;
};

/**
 * The prerun Dockerfile for `parameters`. A parameter with no `applyParameter`, or an empty
 * fragment, adds no line. Throws a ConfigError naming each declaration whose fragment is missing
 * where required, isn't a string, throws, or, for the base image, doesn't start with `FROM`.
 */
export function renderPrerunDockerfile(parameters: PrerunParameters): string {
  const problems: Problem[] = [];
  // undefined after adding a problem.
  const fragment = <R extends keyof Ctxs>(role: R, ctx: Ctxs[R]): string | undefined => {
    const { file, declaration } = parameters[role];
    const problem = (message: string) => problems.push({ file, field: "applyParameter", message });
    const applyParameter = declaration.applyParameter as ((config: unknown, ctx: Ctxs[R]) => unknown) | undefined;
    if (!applyParameter) {
      if (role !== "baseImage") return "";
      problem("is missing. A base image's fragment provides the FROM.");
      return undefined;
    }
    let result: unknown;
    try {
      result = applyParameter(declaration.config, ctx);
    } catch (error) {
      problem(`threw: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
    if (typeof result !== "string") {
      problem(`must return a Dockerfile fragment, a string, got ${typeof result}.`);
      return undefined;
    }
    if (role === "baseImage" && !/^FROM\s/i.test(result.trim())) {
      problem(`must return a fragment that starts with FROM, got ${JSON.stringify(result.trim().split("\n")[0])}.`);
      return undefined;
    }
    return result.trim();
  };

  const steps = [
    fragment("baseImage", { dir: PARAMETER_DIRS.baseImage }),
    "WORKDIR /workspace",
    fragment("codeState", { dir: PARAMETER_DIRS.codeState }),
    fragment("promptSet", { dir: PARAMETER_DIRS.promptSet }),
    fragment("harness", { dir: PARAMETER_DIRS.harness, version: parameters.harness.version }),
    fragment("initialPrompt", {}),
  ];
  if (problems.length > 0) throw problemsError(problems);
  return `${steps.filter((step) => step !== "").join("\n")}\n`;
}

/**
 * The declarations `permutation`'s prerun Dockerfile is rendered from, under `root` (the
 * `.thunderjar/` folder). `permutation` is of a test case of `task` already checked by `loadTestCase`.
 */
export async function loadPrerunParameters(root: string, task: string, permutation: Permutation): Promise<PrerunParameters> {
  const problems: Problem[] = [];
  const load = async <D>(file: string, declareFn: string): Promise<Loaded<D>> => ({
    file,
    declaration: (await loadDeclaration(root, file, declareFn, problems)) as D,
  });
  const { harness, version } = parsePair(permutation.harnessModel);
  const harnessDir = `${PARAMETERS}/harnessModels/${harness}`;
  const [baseImage, codeState, promptSet, harnessDeclaration, versions, initialPrompt] = await Promise.all([
    load<BaseImageDeclaration>(`${PARAMETERS}/baseImages/${permutation.baseImage}/index.ts`, "declareBaseImage"),
    load<CodeStateDeclaration>(`${PARAMETERS}/codeStates/${permutation.codeState}/index.ts`, "declareCodeState"),
    load<PromptSetDeclaration>(`${PARAMETERS}/promptSets/${permutation.promptSet}/index.ts`, "declarePromptSet"),
    load<HarnessDeclaration>(`${harnessDir}/index.ts`, "declareHarness"),
    load<HarnessVersionsDeclaration>(`${harnessDir}/versions.ts`, "declareHarnessVersions"),
    load<InitialPromptDeclaration>(`${PARAMETERS}/tasks/${task}/initial-prompts/${permutation.initialPrompt}.ts`, "declareInitialPrompt"),
  ]);
  if (problems.length > 0) throw problemsError(problems);
  return {
    baseImage,
    codeState,
    promptSet,
    harness: { ...harnessDeclaration, version: (versions.declaration[version] as { version: string }).version },
    initialPrompt,
  };
}
