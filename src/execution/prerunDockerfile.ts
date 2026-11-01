// A permutation's prerun Dockerfile: each parameter's `applyParameter(config, ctx)` fragment, in
// the order the image is built in:
//
//   base image fragment        must start with FROM
//   checkout of a commit       Thunderjar's, if the code state calls checkoutCommit
//   WORKDIR /workspace         Thunderjar's
//   code state fragment        gets the codebase into /workspace, or adds to the checkout
//   prompt set fragment        puts its prompt files in /workspace
//   harness fragment           installs the agent; ctx.version is the pair's version
//   initial prompt fragment    usually left out: the prompt is used when the harness runs
//
// The build context is a folder Thunderjar assembles for the image. Each folder parameter's
// folder is copied into it at its `ctx.dir`, `PARAMETER_DIRS[role]`, named by role rather than
// by parameter, so the Dockerfile depends on what a parameter contains, never on its name: the
// same as its hash.
//
// What a fragment asks of the repository the project is in, through `checkoutCommit` and
// `ctx.git.show`, is recorded as it renders, so every commit a build needs can be checked before
// anything is built. Its build context then gets:
//
//   code.bundle                the code state's commit and its ancestors
//   git/<commit>/<path>        a file at a commit
import { CHECKOUT_COMMIT, type CheckoutCtx } from "../api/checkoutCommit.ts";
import type {
  ApplyParameterCtx,
  BaseImageDeclaration,
  CodeStateDeclaration,
  FragmentCtx,
  GitCtx,
  HarnessApplyCtx,
  HarnessDeclaration,
  HarnessVersionsDeclaration,
  InitialPromptDeclaration,
  PromptSetDeclaration,
} from "../api/declarations.ts";
import { PARAMETERS } from "../config/folders.ts";
import { loadDeclaration, type Problem, problemsError } from "../config/loader.ts";
import { type Permutation, parsePair } from "../config/permutations.ts";
import { BUNDLE_BRANCH } from "../git/git.ts";

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
  codeState: CheckoutCtx;
  promptSet: ApplyParameterCtx;
  harness: HarnessApplyCtx;
  initialPrompt: FragmentCtx;
};

/** Where the code state's bundle goes in the build context. */
export const BUNDLE_PATH = "code.bundle";

/** Something a fragment asked to have put in the build context, at `path`, from a commit. */
export type GitNeed = {
  /** The parameter that asked for it, for messages: `code state "baseline"`. */
  owner: string;
  commit: string;
  path: string;
} & ({ kind: "bundle" } | { kind: "file"; file: string });

/** A rendered prerun Dockerfile, and what its fragments asked for from the repository. */
export type RenderedPrerun = { dockerfile: string; git: GitNeed[] };

const ROLE_NAMES: Record<keyof Ctxs, string> = {
  baseImage: "base image",
  codeState: "code state",
  promptSet: "prompt set",
  harness: "harness",
  initialPrompt: "initial prompt",
};

/** How messages name the parameter declared in `file`: `code state "baseline"`. */
const ownerOf = (role: keyof Ctxs, file: string) => {
  const segments = file.split("/");
  const name = role === "initialPrompt" ? (segments.at(-1) as string).replace(/\.ts$/, "") : segments.at(-2);
  return `${ROLE_NAMES[role]} ${JSON.stringify(name)}`;
};

/** A commit as a fragment names it: a hash, so it means the same content on every machine. */
const COMMIT = /^[0-9a-f]{4,64}$/i;

function checkCommitHash(method: string, commit: string): void {
  if (typeof commit !== "string" || !COMMIT.test(commit)) {
    throw new Error(`${method} needs a commit hash, got ${JSON.stringify(commit)}.`);
  }
}

/** `path` without `.` or empty segments. Throws unless it's inside the repository. */
function repositoryPath(path: string): string {
  const segments = typeof path === "string" ? path.split("/").filter((segment) => segment !== "" && segment !== ".") : [];
  if (typeof path !== "string" || path.startsWith("/") || segments.length === 0 || segments.includes("..")) {
    throw new Error(`ctx.git.show needs a path inside the repository, got ${JSON.stringify(path)}.`);
  }
  return segments.join("/");
}

/** A GitCtx for `owner`'s fragment, recording what it asks for in `needs`. */
function recordingGit(owner: string, needs: GitNeed[]): GitCtx {
  return {
    show(commit, path) {
      checkCommitHash("ctx.git.show", commit);
      const file = repositoryPath(path);
      const need: GitNeed = { kind: "file", owner, commit, file, path: `git/${commit}/${file}` };
      needs.push(need);
      return need.path;
    },
  };
}

/**
 * Thunderjar's lines that check `commit` out into /workspace from the bundle: detached, with
 * nothing after it, no remote, and a git identity so the agent can commit.
 */
const checkoutLines = (commit: string) =>
  [
    `COPY ${BUNDLE_PATH} /tmp/code.bundle`,
    [
      "RUN git clone --quiet /tmp/code.bundle /workspace",
      `git -C /workspace checkout --quiet --detach ${commit}`,
      `git -C /workspace branch --quiet --delete --force ${BUNDLE_BRANCH}`,
      "git -C /workspace remote remove origin",
      'git -C /workspace config user.name "Thunderjar agent"',
      "git -C /workspace config user.email agent@thunderjar.invalid",
      "rm /tmp/code.bundle",
    ].join(" \\\n  && "),
  ].join("\n");

/**
 * The prerun Dockerfile for `parameters`, and what its fragments asked for from the repository.
 * A parameter with no `applyParameter`, or an empty fragment, adds no line. Throws a ConfigError
 * naming each declaration whose fragment is missing where required, isn't a string, throws, or,
 * for the base image, doesn't start with `FROM`.
 */
export function renderPrerun(parameters: PrerunParameters): RenderedPrerun {
  const problems: Problem[] = [];
  const git: GitNeed[] = [];
  const gitOf = (role: keyof Ctxs) => recordingGit(ownerOf(role, parameters[role].file), git);
  let checkout: string | undefined;
  const codeStateCtx: CheckoutCtx = {
    dir: PARAMETER_DIRS.codeState,
    git: gitOf("codeState"),
    [CHECKOUT_COMMIT]: (commit) => {
      checkCommitHash("checkoutCommit", commit);
      if (checkout !== undefined) throw new Error(`checkoutCommit was already called, with ${checkout}: a code state checks out one commit.`);
      checkout = commit;
    },
  };
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

  const baseImage = fragment("baseImage", { dir: PARAMETER_DIRS.baseImage, git: gitOf("baseImage") });
  const codeState = fragment("codeState", codeStateCtx);
  const steps = [
    baseImage,
    checkout === undefined ? "" : checkoutLines(checkout),
    "WORKDIR /workspace",
    codeState,
    fragment("promptSet", { dir: PARAMETER_DIRS.promptSet, git: gitOf("promptSet") }),
    fragment("harness", { dir: PARAMETER_DIRS.harness, git: gitOf("harness"), version: parameters.harness.version }),
    fragment("initialPrompt", { git: gitOf("initialPrompt") }),
  ];
  if (problems.length > 0) throw problemsError(problems);
  if (checkout !== undefined) {
    git.unshift({ kind: "bundle", owner: ownerOf("codeState", parameters.codeState.file), commit: checkout, path: BUNDLE_PATH });
  }
  return { dockerfile: `${steps.filter((step) => step !== "").join("\n")}\n`, git };
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
