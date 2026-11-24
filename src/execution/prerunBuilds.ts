// Building a test case's missing prerun images. `build` builds them and stops; `run` builds them
// as it runs. Both build through here, so they build alike.
//
// Each image is built from a build context of its Dockerfile and its folder parameters' files,
// which DockerService assembles:
//
//   Dockerfile
//   parameters/<role>/     each folder parameter's files/ folder, at its ctx.dir: see PARAMETER_DIRS.
//                          Its index.ts, and anything else beside files/, is never copied.
import type { BuildOptions } from "../api/declarations.ts";
import { FILES, PARAMETERS } from "../config/folders.ts";
import { type HashedPermutation, parsePair } from "../config/permutations.ts";
import type { BuildContext, DockerService } from "../docker/dockerService.ts";
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

/**
 * What `image` is built from: `permutation`'s Dockerfile, and the `files/` folder of each of its
 * folder parameters, under `root`, at its role's folder. A parameter without one copies nothing.
 */
const buildContext = (root: string, permutation: HashedPermutation, image: string, options: BuildOptions): BuildContext => {
  const folders = parameterFolders(permutation);
  return {
    image,
    dockerfile: permutation.dockerfile,
    folders: (Object.keys(PARAMETER_DIRS) as FolderRole[]).map((role) => ({ from: `${root}/${folders[role]}/${FILES}`, to: PARAMETER_DIRS[role] })),
    options,
  };
};

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
 * whether it exists in `docker`'s daemon: where it's built. Throws a DockerUnavailableError if
 * Docker can't be asked.
 */
export async function prerunImages(
  permutations: HashedPermutation[],
  imagePrefix: string | undefined,
  docker: DockerService,
): Promise<(PrerunImage & { exists: boolean })[]> {
  const unique = [...new Map(permutations.map((permutation) => [permutation.imageHash, permutation])).values()];
  const existing = await docker.imagesIn(prerunRepository(imagePrefix));
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
 * folder), with `docker`, given `build`'s secrets and SSH agent, calling `hooks`. Throws a
 * DockerBuildError if the build fails.
 */
export async function buildPrerunImage(
  root: string,
  { permutation, image }: PrerunImage,
  hooks: PrerunBuildHooks,
  build: BuildOptions,
  docker: DockerService,
): Promise<void> {
  hooks.onBuilding?.(image);
  await docker.build(buildContext(root, permutation, image, build));
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
 * `.thunderjar/` folder), that doesn't exist yet in `docker`'s daemon, there, from its
 * Dockerfile, up to `build.concurrency`
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
  imagePrefix: string | undefined,
  hooks: PrerunBuildHooks,
  build: BuildOptions,
  docker: DockerService,
): Promise<PrerunBuildResult> {
  const images = await prerunImages(permutations, imagePrefix, docker);
  const builds = images.filter(({ exists }) => !exists);
  await inParallel(
    builds.map((image) => () => buildPrerunImage(root, image, hooks, build, docker)),
    build.concurrency ?? 1,
  );
  return {
    built: builds.map(({ image }) => image),
    present: images.filter(({ exists }) => exists).map(({ image }) => image),
  };
}
