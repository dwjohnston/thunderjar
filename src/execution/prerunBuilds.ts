// Building a test case's missing prerun images. `build` builds them and stops; `run` builds them
// before running. Both build through here, so they build alike.
//
// Each image is built from a build context assembled in a fresh temporary folder, outside the
// project, and removed afterwards, whether or not the build succeeds:
//
//   Dockerfile
//   parameters/<role>/     each folder parameter, at its ctx.dir: see PARAMETER_DIRS
import { $ } from "bun";
import { PARAMETERS } from "../config/folders.ts";
import { type HashedPermutation, parsePair } from "../config/permutations.ts";
import { buildImage, imagesIn } from "../docker/docker.ts";
import { prerunImage, prerunRepository } from "./images.ts";
import { type FolderRole, loadPrerunParameters, PARAMETER_DIRS, renderPrerunDockerfile } from "./prerunDockerfile.ts";

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

/** Copies each folder parameter of `permutation`, under `root`, into `contextDir`, following symlinks. */
async function copyParameters(root: string, permutation: HashedPermutation, contextDir: string): Promise<void> {
  const folders = parameterFolders(permutation);
  for (const role of Object.keys(PARAMETER_DIRS) as FolderRole[]) {
    const dest = `${contextDir}/${PARAMETER_DIRS[role]}`;
    await $`mkdir -p ${dest}`.quiet();
    await $`cp -RL ${root}/${folders[role]}/. ${dest}`.quiet();
  }
}

export type PrerunBuildHooks = {
  /** Called as each image's build starts. */
  onBuilding?: (image: string) => void;
  /** Called as each image's build succeeds. */
  onBuilt?: (image: string) => void;
};

export type PrerunBuildResult = {
  /** The images built, in plan order. */
  built: string[];
  /** The images that already existed, so weren't built. */
  present: string[];
};

/**
 * Builds the prerun image of each of `permutations`, of a test case of `task` under `root` (the
 * `.thunderjar/` folder), that doesn't exist yet. Permutations with the same hash share one image.
 * Every Dockerfile is rendered before the first build, so a configuration error builds nothing.
 *
 * Throws a DockerUnavailableError if Docker can't be asked which images exist, a ConfigError, or
 * a DockerBuildError if a build fails, after which no other image is built.
 */
export async function buildPrerunImages(
  root: string,
  task: string,
  permutations: HashedPermutation[],
  imagePrefix?: string,
  hooks: PrerunBuildHooks = {},
): Promise<PrerunBuildResult> {
  const unique = [...new Map(permutations.map((permutation) => [permutation.hash, permutation])).values()];
  const existing = await imagesIn(prerunRepository(imagePrefix));
  const images = unique.map((permutation) => ({ permutation, image: prerunImage(permutation.hash, imagePrefix) }));
  const missing = images.filter(({ image }) => !existing.has(image));
  const builds = await Promise.all(
    missing.map(async ({ permutation, image }) => ({
      permutation,
      image,
      dockerfile: renderPrerunDockerfile(await loadPrerunParameters(root, task, permutation)),
    })),
  );

  for (const { permutation, image, dockerfile } of builds) {
    hooks.onBuilding?.(image);
    const contextDir = await temporaryFolder();
    try {
      await copyParameters(root, permutation, contextDir);
      await Bun.write(`${contextDir}/Dockerfile`, dockerfile);
      await buildImage(contextDir, image);
    } finally {
      await $`rm -rf ${contextDir}`.quiet();
    }
    hooks.onBuilt?.(image);
  }

  return {
    built: builds.map(({ image }) => image),
    present: images.filter(({ image }) => existing.has(image)).map(({ image }) => image),
  };
}
