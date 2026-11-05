// A permutation's prerun Dockerfile: each parameter's `applyParameter(config, ctx)` fragment, in
// the order the image is built in:
//
//   base image fragment        must start with FROM
//   WORKDIR /workspace         Thunderjar's
//   code state fragment        gets the codebase into /workspace, e.g. by cloning it at a commit
//   prompt set fragment        puts its prompt files in /workspace
//   harness fragment           installs the agent; ctx.version is the harness's version
//   initial prompt fragment    usually left out: the prompt is used when the harness runs
//
// The build context is a folder Thunderjar assembles for the image. Each folder parameter's
// `files/` folder is copied into it at its `ctx.dir`, `PARAMETER_DIRS[role]`, named by role rather
// than by parameter, so the Dockerfile depends on what a parameter contains, never on its name:
// the same as its hash. A fragment may only use its own: naming another's is a config error.
import type {
  ApplyParameterCtx,
  BaseImageDeclaration,
  CodeStateDeclaration,
  FragmentCtx,
  HarnessApplyCtx,
  HarnessDeclaration,
  InitialPromptDeclaration,
  PromptSetDeclaration,
} from "../api/declarations.ts";
import { type Problem, problemsError } from "../config/loader.ts";

/** The parameters copied into the build context as folders. */
export type FolderRole = "baseImage" | "codeState" | "promptSet" | "harness";

/** Each folder parameter's `ctx.dir`, relative to the build context: where its `files/` folder is copied. */
export const PARAMETER_DIRS: Record<FolderRole, string> = {
  baseImage: "parameters/baseImage",
  codeState: "parameters/codeState",
  promptSet: "parameters/promptSet",
  harness: "parameters/harness",
};

const ROLE_NAMES: Record<FolderRole, string> = {
  baseImage: "base image",
  codeState: "code state",
  promptSet: "prompt set",
  harness: "harness",
};

/** The other parameters' folders in the build context that `fragment`, of `role`'s, names. */
const trespasses = (role: string, fragment: string): FolderRole[] =>
  (Object.keys(PARAMETER_DIRS) as FolderRole[]).filter(
    (other) => other !== role && new RegExp(`(^|[^\\w/.]|\\./)${PARAMETER_DIRS[other]}(?![\\w-])`).test(fragment),
  );

/** One parameter's declaration, and the file it came from, relative to `.thunderjar/`, for messages. */
export type Loaded<D> = { file: string; declaration: D };

/** What a permutation's prerun Dockerfile is rendered from. */
export type PrerunParameters = {
  baseImage: Loaded<BaseImageDeclaration>;
  codeState: Loaded<CodeStateDeclaration>;
  promptSet: Loaded<PromptSetDeclaration>;
  harness: Loaded<HarnessDeclaration>;
  initialPrompt: Loaded<InitialPromptDeclaration>;
};

/** The ctx `applyParameter` gets, by parameter. */
export type Ctxs = {
  baseImage: ApplyParameterCtx;
  codeState: ApplyParameterCtx;
  promptSet: ApplyParameterCtx;
  harness: HarnessApplyCtx;
  initialPrompt: FragmentCtx;
};

export type Role = keyof Ctxs;

/**
 * The fragment of `role`'s parameter, declared in `file`, rendered with `ctx`, and trimmed. A
 * parameter with no `applyParameter` renders "". Undefined, after adding to `problems`, if its
 * fragment is missing where required, isn't a string, throws, names another parameter's folder in
 * the build context, or, for the base image, doesn't start with `FROM`.
 */
export function renderFragment<R extends Role>(
  role: R,
  { file, declaration }: Loaded<{ config?: unknown; applyParameter?: unknown }>,
  ctx: Ctxs[R],
  problems: Problem[],
): string | undefined {
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
  const others = trespasses(role, result);
  if (others.length > 0) {
    const named = others.map((other) => `the ${ROLE_NAMES[other]}'s, ${PARAMETER_DIRS[other]}`).join(", and ");
    problem(`uses another parameter's folder in the build context: ${named}. A fragment can only use its own files/, through ctx.dir.`);
    return undefined;
  }
  return result.trim();
}

/** The prerun Dockerfile of a permutation's fragments, each already rendered, in build order. An empty one adds no line. */
export function joinFragments(fragments: Record<Role, string>): string {
  const steps = [fragments.baseImage, "WORKDIR /workspace", fragments.codeState, fragments.promptSet, fragments.harness, fragments.initialPrompt];
  return `${steps.filter((step) => step !== "").join("\n")}\n`;
}

/**
 * The prerun Dockerfile for `parameters`. Throws a ConfigError naming each declaration whose
 * fragment `renderFragment` finds wrong.
 */
export function renderPrerun(parameters: PrerunParameters): string {
  const problems: Problem[] = [];
  const fragments = {
    baseImage: renderFragment("baseImage", parameters.baseImage, { dir: PARAMETER_DIRS.baseImage }, problems),
    codeState: renderFragment("codeState", parameters.codeState, { dir: PARAMETER_DIRS.codeState }, problems),
    promptSet: renderFragment("promptSet", parameters.promptSet, { dir: PARAMETER_DIRS.promptSet }, problems),
    harness: renderFragment("harness", parameters.harness, { dir: PARAMETER_DIRS.harness, version: parameters.harness.declaration.version }, problems),
    initialPrompt: renderFragment("initialPrompt", parameters.initialPrompt, {}, problems),
  };
  if (problems.length > 0) throw problemsError(problems);
  return joinFragments(fragments as Record<Role, string>);
}
