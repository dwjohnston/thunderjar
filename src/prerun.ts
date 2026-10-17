// A permutation's prerun image — spec/080-docker-execution.md#process and
// spec/060-test-case-parameters.md#declarations-and-applyparameter. Its Dockerfile is a fold
// over each parameter's `applyParameter` fragment, with Thunderjar's own steps between them:
//
//   base image fragment                  carries the FROM
//   clone of the code state's commit     Thunderjar: code.bundle, detached, no remote
//   code state fragment                  runs in /workspace
//   prompt set's files                   Thunderjar: COPY prompt-set/<dest> /workspace/<dest>
//   prompt set fragment
//   harness fragment                     ctx.version is the pair's resolved version
//   initial prompt fragment              usually empty
//
// The build context beside it holds the bundle (spec/062-code-state.md#how-the-code-gets-into-the-image)
// and the prompt files read at the prompt set's commit (spec/063-prompt-set.md). Images are
// tagged in a local repository, `thunderjar`, until the image store arrives.

import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import type { Docker } from "./adapters/docker/docker.ts";
import { InvalidConfigError, parseHarnessModelPair } from "./config.ts";
import type { HarnessDeclaration, HarnessVersionEntry, InitialPromptDeclaration } from "./declarations.ts";
import type { Repository } from "./repository.ts";
import type { ResolvedPermutation } from "./resolve.ts";
import { prerunTag } from "./tags.ts";

/** Where prerun images are tagged until the image store (spec/081-docker-tagging.md) arrives. */
export const LOCAL_REPOSITORY = "thunderjar";

/** A permutation's prerun image reference: `thunderjar:prerun-h4f9a21c8`. */
export const prerunImageRef = (repository: string, permutationHash: string) =>
  `${repository}:${prerunTag(permutationHash)}`;

type Fragment = (ctx: { resolvedHash?: string }) => string;

/** What a permutation's prerun image is built from, loaded from its declarations. */
export interface PrerunParameters {
  baseImage: { applyParameter: Fragment };
  codeState: { name: string; commit: string; applyParameter: Fragment };
  promptSet: { name: string; commit: string; files: Record<string, string>; applyParameter: Fragment };
  harness: { version: string; applyParameter: (ctx: { version: string; resolvedHash?: string }) => string };
  initialPrompt: { applyParameter: Fragment };
}

const importDefault = async <T>(path: string) => ((await import(path)) as { default: T }).default;

/** A declared commit; a floating one (a function of ctx.resolvedHash) needs 2600's resolution first. */
function pinnedCommit(file: string, commit: unknown): string {
  if (typeof commit === "string" && commit !== "") return commit;
  if (typeof commit === "function") {
    throw new InvalidConfigError([{ file, field: "commit", message: "floating commits are not supported yet" }]);
  }
  throw new InvalidConfigError([{ file, field: "commit", message: `must be a commit hash, got ${JSON.stringify(commit)}` }]);
}

/**
 * Where a prompt file goes, relative to /workspace. It must stay inside /workspace, so `..`
 * and absolute paths are configuration errors.
 */
function promptFileDest(file: string, dest: string): string {
  const normal = posix.normalize(dest);
  if (dest === "" || posix.isAbsolute(dest) || normal === "." || normal.split("/").includes("..")) {
    throw new InvalidConfigError([
      { file, field: "files", message: `${JSON.stringify(dest)} must be a path inside /workspace, relative to it` },
    ]);
  }
  return normal;
}

/** Loads one permutation's declarations, under the `.thunderjar/` root `root`, for `task`. */
export async function loadPrerunParameters(
  root: string,
  task: string,
  permutation: ResolvedPermutation,
): Promise<PrerunParameters> {
  const parameters = join(root, "test-case-parameters");
  const codeStateFile = `test-case-parameters/codeStates/${permutation.codeState}/index.ts`;
  const promptSetFile = `test-case-parameters/promptSets/${permutation.promptSet}/index.ts`;
  const baseImage = await importDefault<PrerunParameters["baseImage"]>(
    join(parameters, "baseImages", permutation.baseImage, "index.ts"),
  );
  const codeState = await importDefault<{ commit: unknown; applyParameter: Fragment }>(join(root, codeStateFile));
  const promptSet = await importDefault<{ commit: unknown; files: Record<string, string>; applyParameter: Fragment }>(
    join(root, promptSetFile),
  );

  const { family, version } = parseHarnessModelPair(permutation.harnessModel)!; // checked by loadTestCase
  const familyDir = join(parameters, "harnessModels", family);
  const harness = await importDefault<HarnessDeclaration>(join(familyDir, "index.ts"));
  const entry = (await importDefault<Record<string, HarnessVersionEntry>>(join(familyDir, "versions.ts")))[version]!;
  if (!("version" in entry)) throw new Error(`${permutation.harnessModel}: floating versions are not supported yet`);

  const initialPrompt = await importDefault<InitialPromptDeclaration>(
    join(parameters, "tasks", task, "initial-prompts", `${permutation.initialPrompt}.ts`),
  );

  return {
    baseImage,
    codeState: {
      name: permutation.codeState,
      commit: pinnedCommit(codeStateFile, codeState.commit),
      applyParameter: codeState.applyParameter,
    },
    promptSet: {
      name: permutation.promptSet,
      commit: pinnedCommit(promptSetFile, promptSet.commit),
      files: Object.fromEntries(
        Object.entries(promptSet.files).map(([path, dest]) => [path, promptFileDest(promptSetFile, dest)]),
      ),
      applyParameter: promptSet.applyParameter,
    },
    harness: { version: entry.version, applyParameter: entry.applyParameter ?? harness.applyParameter },
    initialPrompt,
  };
}

/** A COPY line, in JSON form when a path has whitespace in it. */
const copy = (src: string, dest: string) =>
  /\s/.test(src + dest) ? `COPY ${JSON.stringify([src, dest])}` : `COPY ${src} ${dest}`;

/**
 * The prerun Dockerfile: each fragment in order, with Thunderjar's checkout of
 * `codeState.commit` and its prompt-file COPY lines. An empty fragment adds no line.
 */
export function renderPrerunDockerfile({ baseImage, codeState, promptSet, harness, initialPrompt }: PrerunParameters): string {
  const ctx = {};
  const checkout = [
    "COPY code.bundle /tmp/code.bundle",
    [
      "RUN git clone --quiet /tmp/code.bundle /workspace",
      `git -C /workspace checkout --quiet --detach ${codeState.commit}`,
      "git -C /workspace remote remove origin",
      `git -C /workspace config user.name "Thunderjar agent"`,
      "git -C /workspace config user.email agent@thunderjar.invalid",
      "rm /tmp/code.bundle",
    ].join(" \\\n  && "),
    "WORKDIR /workspace",
  ].join("\n");
  const promptFiles = Object.values(promptSet.files)
    .map((dest) => copy(`prompt-set/${dest}`, `/workspace/${dest}`))
    .join("\n");

  const steps = [
    baseImage.applyParameter(ctx),
    checkout,
    codeState.applyParameter(ctx),
    promptFiles,
    promptSet.applyParameter(ctx),
    harness.applyParameter({ version: harness.version }),
    initialPrompt.applyParameter(ctx),
  ];
  return `${steps.filter((step) => step.trim() !== "").join("\n")}\n`;
}

/** The commits a build needs that the repository doesn't have, one problem per line. */
export class MissingCommitsError extends Error {}

/**
 * Checks that the repository has every commit, and every prompt file at its commit, that
 * building `needed` reads — spec/062-code-state.md#where-the-commit-comes-from. Returns each
 * declared commit's full hash. Throws MissingCommitsError naming everything missing, before
 * anything is built.
 */
export async function checkCommits(needed: PrerunParameters[], repository: Repository): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  const problems = new Set<string>();
  const check = async (commit: string, owner: string) => {
    if (resolved.has(commit)) return true;
    const full = await repository.resolveCommit(commit);
    if (full) {
      resolved.set(commit, full);
      return true;
    }
    problems.add(
      `error: commit ${commit} (${owner}) is not in this repository.\nFetch it, or check that it has been pushed.`,
    );
    return false;
  };
  for (const { codeState, promptSet } of needed) {
    await check(codeState.commit, `code state "${codeState.name}"`);
    const owner = `prompt set "${promptSet.name}"`;
    if (!(await check(promptSet.commit, owner))) continue;
    for (const path of Object.keys(promptSet.files)) {
      if ((await repository.readFile(promptSet.commit, path)) === undefined) {
        problems.add(`error: ${path} is not in commit ${promptSet.commit} (${owner}).`);
      }
    }
  }
  if (problems.size > 0) throw new MissingCommitsError([...problems].join("\n"));
  return resolved;
}

/**
 * Writes a prerun image's build context to `dir`, replacing what was there: its Dockerfile,
 * `code.bundle` with the code state's commit, and `prompt-set/<dest>` for each prompt file.
 * The commits must already be checked by `checkCommits`; `parameters.codeState.commit` should
 * be the full hash it gave.
 */
export async function assembleBuildContext(parameters: PrerunParameters, repository: Repository, dir: string) {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "Dockerfile"), renderPrerunDockerfile(parameters));
  await repository.bundle(parameters.codeState.commit, join(dir, "code.bundle"));
  const { commit, files } = parameters.promptSet;
  for (const [path, dest] of Object.entries(files)) {
    const contents = await repository.readFile(commit, path);
    if (contents === undefined) throw new Error(`${path} is not in commit ${commit}`);
    await mkdir(dirname(join(dir, "prompt-set", dest)), { recursive: true });
    await writeFile(join(dir, "prompt-set", dest), contents);
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
