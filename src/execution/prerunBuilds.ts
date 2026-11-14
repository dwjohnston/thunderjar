// Building a test case's missing prerun images. `build` builds them and stops; `run` builds them
// as it runs. Both build through here, so they build alike.
//
// Each image is built from a build context assembled in a fresh temporary folder, outside the
// project, and removed afterwards, whether or not the build succeeds:
//
//   Dockerfile
//   parameters/<role>/     each folder parameter's files/ folder, at its ctx.dir: see PARAMETER_DIRS.
//                          Its index.ts, and anything else beside files/, is never copied.
import { $ } from "bun";
import type { BuildOptions } from "../api/declarations.ts";
import { FILES, PARAMETERS } from "../config/folders.ts";
import { existsIn } from "../config/loader.ts";
import { type HashedPermutation, parsePair } from "../config/permutations.ts";
import { buildImage, imagesIn } from "../docker/docker.ts";
import { prerunImage, prerunRepository } from "./images.ts";
import { inParallel } from "./inParallel.ts";
import { type FolderRole, PARAMETER_DIRS } from "./prerunDockerfile.ts";

/** Where each folder parameter of `permutation` is, relative to `.thunderjar/`. */
const parameterFolders = (permutation: HashedPermutation): Record<FolderRole, string> => ({
  baseImage: `${PARAMETERS}/baseImages/${permutation.baseImage}`,
  codeState: `${PARAMETERS}/codeStates/${permutation.codeState}`,
  promptSet: `${PARAMETERS}/promptSets/${permutation.promptSet}`,
  harness: `${PARAMETERS}/harnessModels/${parsePair(permutation.harnessModel).harness}`,
});

/** A fresh, empty folder under the system's temporary folder. */
async function temporaryFolder(): Promise<string> {
  const dir = `${Bun.env.TMPDIR || "/tmp"}/thunderjar-build-${crypto.randomUUID()}`;
  await $`mkdir -p ${dir}`.quiet();
  return dir;
}

/**
 * Copies the `files/` folder of each folder parameter of `permutation`, under `root`, into
 * `contextDir`, following symlinks. A parameter without one copies nothing.
 */
async function copyParameters(root: string, permutation: HashedPermutation, contextDir: string): Promise<void> {
  const folders = parameterFolders(permutation);
  for (const role of Object.keys(PARAMETER_DIRS) as FolderRole[]) {
    const files = `${folders[role]}/${FILES}/`;
    if (!(await existsIn(root, files))) continue;
    const dest = `${contextDir}/${PARAMETER_DIRS[role]}`;
    await $`mkdir -p ${dest}`.quiet();
    await $`cp -RL ${root}/${files}. ${dest}`.quiet();
  }
}

export type PrerunBuildHooks = {
  /** Called as each image's build starts. */
  onBuilding?: (image: string) => void;
  /** Called as each image's build succeeds. */
  onBuilt?: (image: string) => void;
};

/** A prerun image a test case needs: the first permutation with its image hash, and the image. */
export type PrerunImage = { permutation: HashedPermutation; image: string };

/**
 * The prerun image of each of `permutations`, once per image hash, in plan order, each with
 * whether it exists in the local Docker daemon. Throws a DockerUnavailableError if Docker can't
 * be asked.
 */
export async function prerunImages(permutations: HashedPermutation[], imagePrefix?: string): Promise<(PrerunImage & { exists: boolean })[]> {
  const unique = [...new Map(permutations.map((permutation) => [permutation.imageHash, permutation])).values()];
  const existing = await imagesIn(prerunRepository(imagePrefix));
  return unique.map((permutation) => {
    const image = prerunImage(permutation.imageHash, imagePrefix);
    return { permutation, image, exists: existing.has(image) };
  });
}

/** The prerun image of each of `permutations`, once per image hash, in plan order, none looked for in the local Docker daemon. */
export function storedPrerunImages(permutations: HashedPermutation[], imagePrefix?: string): (PrerunImage & { exists: boolean })[] {
  const unique = [...new Map(permutations.map((permutation) => [permutation.imageHash, permutation])).values()];
  return unique.map((permutation) => ({ permutation, image: prerunImage(permutation.imageHash, imagePrefix), exists: false }));
}

/**
 * Builds `image` from `permutation`'s Dockerfile, of a test case under `root` (the `.thunderjar/`
 * folder), given `build`'s secrets and SSH agent, calling `hooks`. Throws a ConfigError, or a
 * DockerBuildError if the build fails.
 */
export async function buildPrerunImage(root: string, { permutation, image }: PrerunImage, hooks: PrerunBuildHooks = {}, build: BuildOptions = {}): Promise<void> {
  hooks.onBuilding?.(image);
  const contextDir = await temporaryFolder();
  try {
    await copyParameters(root, permutation, contextDir);
    await Bun.write(`${contextDir}/Dockerfile`, permutation.dockerfile);
    await buildImage(contextDir, image, build);
  } finally {
    await $`rm -rf ${contextDir}`.quiet();
  }
  hooks.onBuilt?.(image);
}

export type PrerunBuildResult = {
  /** The images built, in plan order. */
  built: string[];
  /** The images that already existed, so weren't built. */
  present: string[];
};

/**
 * Builds the prerun image of each of `permutations`, of a test case under `root` (the
 * `.thunderjar/` folder), that doesn't exist yet, from its Dockerfile, up to `build.concurrency`
 * at once. Permutations with the same image hash share one image. Each build is given `build`'s
 * secrets and SSH agent.
 *
 * Throws a DockerUnavailableError if Docker can't be asked which images exist, a ConfigError, or
 * a DockerBuildError if a build fails, after which no other build starts, and those already
 * building finish first.
 */
export async function buildPrerunImages(
  root: string,
  permutations: HashedPermutation[],
  imagePrefix?: string,
  hooks: PrerunBuildHooks = {},
  build: BuildOptions = {},
): Promise<PrerunBuildResult> {
  const images = await prerunImages(permutations, imagePrefix);
  const builds = images.filter(({ exists }) => !exists);
  await inParallel(
    builds.map((image) => () => buildPrerunImage(root, image, hooks, build)),
    build.concurrency ?? 1,
  );
  return {
    built: builds.map(({ image }) => image),
    present: images.filter(({ exists }) => exists).map(({ image }) => image),
  };
}
