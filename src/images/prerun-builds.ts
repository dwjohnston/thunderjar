// Building a test case's missing prerun images — spec/080-docker-execution.md#process, as far as
// "Prerun image ready". `build` builds them and stops; `run` builds each just before running
// its permutation. Both get them from here, so they build alike.
//
// Before anything is built it checks that Docker can be reached, and, if any fragment reads
// commits through ctx.git, that the repository has every one of them
// (spec/062-code-state.md#where-the-commit-comes-from), so a missing commit fails before
// anything is built. A project whose fragments read no commits needs no repository at all. An
// image that already exists is reused, and its commits aren't read. Each build context is
// kept, so a failed build can be inspected:
//
//   <root dir>/builds/prerun-h4f9a21c8/
//     Dockerfile
//     parameters/<role>/          each folder parameter, as its ctx.dir
//     git/<commit>.bundle         what ctx.git asked for
//     git/<commit>/<path>

import { dirname, join } from "../platform/path.ts";
import { DockerBuildError, type Docker } from "../adapters/docker/docker.ts";
import type { ResolvedPermutation } from "../matrix/resolve.ts";
import { prerunTag } from "../matrix/tags.ts";
import {
  assembleBuildContext,
  checkCommits,
  loadPrerunParameters,
  prerunImageRef,
  prerunStatuses,
  renderPrerun,
  type PrerunParameters,
} from "./prerun.ts";
import { findRepository, type Repository } from "./repository.ts";

/** The directory a prerun image's build context is kept in. */
export const buildContextDir = (rootDir: string, permutationHash: string) =>
  join(rootDir, "builds", prerunTag(permutationHash));

export interface PrerunBuilds {
  /** The hashes of the permutations whose prerun image doesn't exist yet. */
  missing: Set<string>;
  /** Builds one missing prerun image, then it is no longer missing. Throws if the build fails. */
  build(permutationHash: string): Promise<void>;
}

export interface PrerunBuildOptions {
  /** The `.thunderjar/` root. */
  root: string;
  task: string;
  permutations: ResolvedPermutation[];
  docker: Docker;
  /** The image repository prerun images are tagged in, `--image-prefix`. */
  repository: string;
  /** Build contexts are kept under `<rootDir>/builds/`. */
  rootDir: string;
  /** What needs Docker, for the error when it can't be reached: "Building prerun images". */
  purpose: string;
}

/**
 * Finds which of `permutations`' prerun images are missing, and checks everything their builds
 * need, before any is built.
 */
export async function preparePrerunBuilds(options: PrerunBuildOptions): Promise<PrerunBuilds> {
  const { root, task, permutations, docker, repository, rootDir, purpose } = options;
  const found = await prerunStatuses(docker, repository, permutations);
  if ("unreachable" in found) {
    throw new Error(`error: Docker can't be reached (${found.unreachable}). ${purpose} needs Docker.`);
  }

  const parameters = new Map<string, PrerunParameters>();
  for (const permutation of permutations) {
    if (found.statuses.get(permutation.hash) !== "missing") continue;
    parameters.set(permutation.hash, await loadPrerunParameters(root, task, permutation));
  }

  // Rendering every Dockerfile first finds the commits the builds read, so they're checked before any build.
  const gitNeeds = [...parameters.values()].flatMap((p) => renderPrerun(p).git);
  let repo: Repository | undefined;
  if (gitNeeds.length > 0) {
    const projectDir = dirname(root);
    repo = await findRepository(projectDir);
    if (!repo) {
      const [{ owner, commit }] = gitNeeds as [(typeof gitNeeds)[number]];
      throw new Error(`error: ${projectDir} is not in a git repository, but ${owner} reads commit ${commit} from it.`);
    }
    await checkCommits(gitNeeds, repo);
  }

  const missing = new Set(parameters.keys());
  return {
    missing,
    async build(permutationHash) {
      const declared = parameters.get(permutationHash);
      if (!declared || !missing.has(permutationHash)) throw new Error(`prerun image ${permutationHash} isn't missing`);
      const ref = prerunImageRef(repository, permutationHash);
      const contextDir = buildContextDir(rootDir, permutationHash);
      await assembleBuildContext(declared, repo, contextDir);
      try {
        await docker.build(contextDir, ref);
      } catch (error) {
        if (!(error instanceof DockerBuildError)) throw error;
        throw new Error(
          `error: building ${ref} failed (docker build exited ${error.exitCode}).\nIts build context is kept in ${contextDir}`,
        );
      }
      missing.delete(permutationHash);
    },
  };
}
