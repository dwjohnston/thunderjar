// A permutation's prerun image — spec/080-docker-execution.md#process and
// spec/060-test-case-parameters.md#declarations-and-applyparameter. Its Dockerfile is a fold
// over each parameter's `applyParameter(config, ctx)` fragment, in a fixed order:
//
//   base image fragment        carries the FROM
//   harness fragment           ctx.version is the pair's resolved version
//   WORKDIR /workspace         Thunderjar's only line
//   code state fragment        gets the codebase into /workspace: copied, or checkoutCommit
//   prompt set fragment        puts its prompt files in /workspace
//   initial prompt fragment    usually empty
//
// What applying a parameter does is the parameter's own business. A fragment can COPY from
// two places in the build context:
//
//   parameters/<role>/    the parameter's folder, as ctx.dir: files bundled beside the
//                         declaration, already part of its hash
//   git/<commit>…         what ctx.git asked for from the repository Thunderjar is run in: a
//                         bundle of a commit, or a file at a commit
//
// Rendering calls every fragment with a ctx that records what ctx.git was asked for, so the
// commits a build needs are known, and checked, before anything is built. Images are tagged in
// a local repository, `thunderjar`, until the image store arrives.

import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, posix, relative } from "node:path";
import type { Docker } from "../adapters/docker/docker.ts";
import { parseHarnessModelPair } from "../project/config.ts";
import type {
  ApplyParameterCtx,
  GitBuildContext,
  HarnessApplyCtx,
  HarnessDeclaration,
  HarnessVersionEntry,
  InitialPromptDeclaration,
} from "../api/declarations.ts";
import { FAMILY_MAP_FILES } from "../matrix/hashing.ts";
import type { Repository } from "./repository.ts";
import type { ResolvedPermutation } from "../matrix/resolve.ts";
import { prerunTag } from "../matrix/tags.ts";

/** Where prerun images are tagged until the image store (spec/081-docker-tagging.md) arrives. */
export const LOCAL_REPOSITORY = "thunderjar";

/** A permutation's prerun image reference: `thunderjar:prerun-h4f9a21c8`. */
export const prerunImageRef = (repository: string, permutationHash: string) =>
  `${repository}:${prerunTag(permutationHash)}`;

/** One parameter's fragment, as loaded. */
interface Parameter<Ctx> {
  /** How messages name it: `code state "baseline"`. */
  owner: string;
  config: unknown;
  applyParameter: (config: unknown, ctx: Ctx) => string;
}

/** A parameter that is a folder, copied into the build context as `ctx.dir`. */
interface FolderParameter<Ctx> extends Parameter<Ctx> {
  /** The folder on disk. */
  dir: string;
  /** Files directly inside it that aren't part of its hash, so aren't copied. */
  exclude?: string[];
}

/** What a permutation's prerun image is built from, loaded from its declarations. */
export interface PrerunParameters {
  baseImage: FolderParameter<ApplyParameterCtx>;
  harness: FolderParameter<HarnessApplyCtx> & { version: string };
  codeState: FolderParameter<ApplyParameterCtx>;
  promptSet: FolderParameter<ApplyParameterCtx>;
  initialPrompt: Parameter<Omit<ApplyParameterCtx, "dir">>;
}

type Role = Exclude<keyof PrerunParameters, "initialPrompt">;

/** Each folder parameter's `ctx.dir`: named by role, so renaming a parameter's folder changes nothing. */
export const PARAMETER_DIRS: Record<Role, string> = {
  baseImage: "parameters/baseImage",
  harness: "parameters/harnessModel",
  codeState: "parameters/codeState",
  promptSet: "parameters/promptSet",
};

const importDefault = async <T>(path: string) => ((await import(path)) as { default: T }).default;

/** Loads one permutation's declarations, under the `.thunderjar/` root `root`, for `task`. */
export async function loadPrerunParameters(
  root: string,
  task: string,
  permutation: ResolvedPermutation,
): Promise<PrerunParameters> {
  const parameters = join(root, "test-case-parameters");
  const folder = async <Ctx>(dir: string, owner: string): Promise<FolderParameter<Ctx>> => {
    const { config, applyParameter } = await importDefault<FolderParameter<Ctx>>(join(dir, "index.ts"));
    return { owner, dir, config, applyParameter };
  };

  const { family, version } = parseHarnessModelPair(permutation.harnessModel)!; // checked by loadTestCase
  const familyDir = join(parameters, "harnessModels", family);
  const harness = await importDefault<HarnessDeclaration>(join(familyDir, "index.ts"));
  const entry = (await importDefault<Record<string, HarnessVersionEntry>>(join(familyDir, "versions.ts")))[version]!;
  if (!("version" in entry)) throw new Error(`${permutation.harnessModel}: floating versions are not supported yet`);

  const initialPrompt = await importDefault<InitialPromptDeclaration>(
    join(parameters, "tasks", task, "initial-prompts", `${permutation.initialPrompt}.ts`),
  );

  return {
    baseImage: await folder(join(parameters, "baseImages", permutation.baseImage), `base image "${permutation.baseImage}"`),
    harness: {
      owner: `harness/model pair "${permutation.harnessModel}"`,
      dir: familyDir,
      exclude: FAMILY_MAP_FILES,
      config: harness.config,
      applyParameter: entry.applyParameter ?? harness.applyParameter,
      version: entry.version,
    },
    codeState: await folder(join(parameters, "codeStates", permutation.codeState), `code state "${permutation.codeState}"`),
    promptSet: await folder(join(parameters, "promptSets", permutation.promptSet), `prompt set "${permutation.promptSet}"`),
    initialPrompt: {
      owner: `initial prompt "${permutation.initialPrompt}"`,
      config: initialPrompt.config,
      applyParameter: initialPrompt.applyParameter as Parameter<Omit<ApplyParameterCtx, "dir">>["applyParameter"],
    },
  };
}

/** Something a fragment asked ctx.git to put in the build context, at `path`. */
export type GitNeed = { owner: string; commit: string; path: string } & (
  | { kind: "bundle" }
  | { kind: "file"; file: string }
);

/** A commit a fragment names: a hash, so it means the same content on every machine. */
const COMMIT = /^[0-9a-f]{4,64}$/i;

/** A GitBuildContext for `owner`'s fragment, recording each request in `needs`. */
function recordingGit(owner: string, needs: GitNeed[]): GitBuildContext {
  const checkCommit = (method: string, commit: string) => {
    if (!COMMIT.test(commit)) {
      throw new Error(`error: ${owner}: ctx.git.${method} needs a commit hash, got ${JSON.stringify(commit)}.`);
    }
  };
  return {
    bundle(commit) {
      checkCommit("bundle", commit);
      const path = `git/${commit}.bundle`;
      needs.push({ kind: "bundle", owner, commit, path });
      return path;
    },
    show(commit, file) {
      checkCommit("show", commit);
      const normal = posix.normalize(file);
      if (file === "" || posix.isAbsolute(file) || normal === "." || normal.split("/").includes("..")) {
        throw new Error(`error: ${owner}: ctx.git.show needs a path inside the repository, got ${JSON.stringify(file)}.`);
      }
      const path = `git/${commit}/${normal}`;
      needs.push({ kind: "file", owner, commit, file: normal, path });
      return path;
    },
  };
}

/**
 * The prerun Dockerfile, and what its fragments asked ctx.git for. An empty fragment adds no
 * line.
 */
export function renderPrerun(parameters: PrerunParameters): { dockerfile: string; git: GitNeed[] } {
  const git: GitNeed[] = [];
  const ctx = (role: Role) => ({ git: recordingGit(parameters[role].owner, git), dir: PARAMETER_DIRS[role] });
  const { baseImage, harness, codeState, promptSet, initialPrompt } = parameters;

  const steps = [
    baseImage.applyParameter(baseImage.config, ctx("baseImage")),
    harness.applyParameter(harness.config, { ...ctx("harness"), version: harness.version }),
    "WORKDIR /workspace",
    codeState.applyParameter(codeState.config, ctx("codeState")),
    promptSet.applyParameter(promptSet.config, ctx("promptSet")),
    initialPrompt.applyParameter(initialPrompt.config, { git: recordingGit(initialPrompt.owner, git) }),
  ];
  return { dockerfile: `${steps.filter((step) => step.trim() !== "").join("\n")}\n`, git };
}

/** The commits a build needs that the repository doesn't have, one problem per line. */
export class MissingCommitsError extends Error {}

/**
 * Checks that the repository has every commit, and every file at its commit, that `needs`
 * names — spec/062-code-state.md#where-the-commit-comes-from. Throws MissingCommitsError naming
 * everything missing, before anything is built.
 */
export async function checkCommits(needs: GitNeed[], repository: Repository): Promise<void> {
  const problems = new Set<string>();
  const present = new Map<string, boolean>();
  for (const need of needs) {
    if (!present.has(need.commit)) present.set(need.commit, (await repository.resolveCommit(need.commit)) !== undefined);
    if (!present.get(need.commit)) {
      problems.add(
        `error: commit ${need.commit} (${need.owner}) is not in this repository.\nFetch it, or check that it has been pushed.`,
      );
    } else if (need.kind === "file" && (await repository.readFile(need.commit, need.file)) === undefined) {
      problems.add(`error: ${need.file} is not in commit ${need.commit} (${need.owner}).`);
    }
  }
  if (problems.size > 0) throw new MissingCommitsError([...problems].join("\n"));
}

/**
 * Writes a prerun image's build context to `dir`, replacing what was there: its Dockerfile,
 * each folder parameter's folder at its `ctx.dir`, and what its fragments asked ctx.git for.
 * `repository` is needed only if they asked for anything, and its commits must already be
 * checked by `checkCommits`.
 */
export async function assembleBuildContext(parameters: PrerunParameters, repository: Repository | undefined, dir: string) {
  const { dockerfile, git } = renderPrerun(parameters);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "Dockerfile"), dockerfile);

  for (const role of Object.keys(PARAMETER_DIRS) as Role[]) {
    const { dir: source, exclude = [] } = parameters[role];
    await cp(source, join(dir, PARAMETER_DIRS[role]), {
      recursive: true,
      filter: (src) => !exclude.includes(relative(source, src)),
    });
  }

  const written = new Set<string>();
  for (const need of git) {
    if (written.has(need.path)) continue;
    written.add(need.path);
    if (!repository) throw new Error(`${need.owner} reads commit ${need.commit}, but there is no repository to read it from`);
    const dest = join(dir, need.path);
    await mkdir(dirname(dest), { recursive: true });
    if (need.kind === "bundle") {
      const full = await repository.resolveCommit(need.commit);
      if (!full) throw new Error(`commit ${need.commit} is not in the repository`);
      await repository.bundle(full, dest);
    } else {
      const contents = await repository.readFile(need.commit, need.file);
      if (contents === undefined) throw new Error(`${need.file} is not in commit ${need.commit}`);
      await writeFile(dest, contents);
    }
  }
}

export type PrerunStatus = "exists" | "missing";

/**
 * Whether each permutation's prerun image already exists, by permutation hash, or why Docker
 * couldn't be asked.
 */
export async function prerunStatuses(
  docker: Docker,
  repository: string,
  permutations: ResolvedPermutation[],
): Promise<{ statuses: Map<string, PrerunStatus> } | { unreachable: string }> {
  const unreachable = await docker.unreachable();
  if (unreachable !== undefined) return { unreachable };
  const statuses = new Map<string, PrerunStatus>();
  for (const { hash } of permutations) {
    if (statuses.has(hash)) continue;
    statuses.set(hash, (await docker.imageExists(prerunImageRef(repository, hash))) ? "exists" : "missing");
  }
  return { statuses };
}

/** How `plan` and `run --dry-run` show a prerun image's status. */
export const showPrerunStatus = (status: PrerunStatus | undefined) =>
  status === "exists" ? " (exists, reused)" : status === "missing" ? " (will build)" : "";

/** What `plan` and `run --dry-run` say when Docker can't be asked whether images exist. */
export const unreachableNote = (reason: string) =>
  `Docker can't be reached (${reason}), so whether each prerun image exists is unknown.`;
