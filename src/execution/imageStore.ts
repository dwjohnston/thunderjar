// Pushing images to the image store, the registry repository `thunderjar.config.ts` names. With
// `imageStore: null`, images stay in the local Docker daemon and nothing here runs.
//
// Pushing needs the user's `docker login` for the registry. It's checked before anything is built
// or run, so a missing login fails in seconds, not after the agents have run.
import type { ImageStore } from "../api/declarations.ts";
import type { HashedPermutation } from "../config/permutations.ts";
import { registryHost } from "../config/projectConfig.ts";
import { checkLogin, DockerLoginError, type DockerRuntime, localRuntime, pullImage, pushImage } from "../docker/docker.ts";
import { prerunImage, storedPrerunImage } from "./images.ts";

/** Thrown when Docker has no valid login for the image store's registry. */
export class ImageStoreLoginError extends Error {
  constructor(
    readonly repository: string,
    readonly host: string,
    readonly reason: string,
  ) {
    super(`Can't push to ${repository}: no valid Docker login for ${host} (${reason}). Run \`docker login ${host}\`.`);
  }
}

/**
 * Checks that images can be pushed to `imageStore`: that Docker holds a valid login for its
 * registry. Does nothing for `null`. Throws an ImageStoreLoginError, or a DockerUnavailableError.
 */
export async function checkImageStore(imageStore: ImageStore | null): Promise<void> {
  if (imageStore === null) return;
  const host = registryHost(imageStore.repository);
  try {
    await checkLogin(host);
  } catch (error) {
    if (error instanceof DockerLoginError) throw new ImageStoreLoginError(imageStore.repository, host, error.message);
    throw error;
  }
}

export type PushHooks = {
  /** Called as each push starts, with the local image and where it's pushed. */
  onPushing?: (image: string, reference: string) => void;
  /** Called as each push succeeds. */
  onPushed?: (image: string, reference: string) => void;
};

/** Tags `image`, in `runtime`, as `reference` and pushes it, calling `hooks`. Throws a DockerPushError. */
export async function pushToStore(image: string, reference: string, hooks: PushHooks = {}, runtime: DockerRuntime = localRuntime()): Promise<void> {
  hooks.onPushing?.(image, reference);
  await pushImage(image, reference, runtime);
  hooks.onPushed?.(image, reference);
}

/**
 * Pushes the prerun image of each of `permutations` to `imageStore`, once per image hash, whether it was
 * just built or already existed, so the store has every image an execution starts from. Does
 * nothing for `null`. Throws a DockerPushError, after which nothing else is pushed.
 */
export async function pushPrerunImages(
  permutations: HashedPermutation[],
  imageStore: ImageStore | null,
  imagePrefix?: string,
  hooks: PushHooks = {},
): Promise<string[]> {
  if (imageStore === null) return [];
  const hashes = [...new Set(permutations.map(({ imageHash }) => imageHash))];
  const pushed: string[] = [];
  for (const hash of hashes) {
    const reference = storedPrerunImage(imageStore.repository, hash);
    await pushToStore(prerunImage(hash, imagePrefix), reference, hooks);
    pushed.push(reference);
  }
  return pushed;
}

export type PullHooks = {
  /** Called as the runtime starts pulling each image. */
  onPulling?: (reference: string) => void;
  /** Called as each pull succeeds. */
  onPulled?: (reference: string) => void;
};

/**
 * Pulls each of `references` into `runtime`, so a runtime that can't reach the image store, or
 * has no login for it, fails here, before any agent runs. Throws a DockerPullError.
 */
export async function pullIntoRuntime(references: string[], runtime: DockerRuntime, hooks: PullHooks = {}): Promise<void> {
  for (const reference of references) {
    hooks.onPulling?.(reference);
    await pullImage(reference, runtime);
    hooks.onPulled?.(reference);
  }
}
