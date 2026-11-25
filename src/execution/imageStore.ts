// The image store is the registry repository `thunderjar.config.ts` names. Pushing to it needs the
// user's `docker login` for the registry. It's checked before anything is built or run, so a
// missing login fails in seconds, not after the agents have run. `run` checks it through its
// injected Docker (run/ensureImages.ts); `doctor` and `purge` through `checkImageStore`.
import type { ImageStore } from "../api/declarations.ts";
import { registryHost } from "../config/projectConfig.ts";
import { checkLogin, DockerLoginError } from "../docker/docker.ts";

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
