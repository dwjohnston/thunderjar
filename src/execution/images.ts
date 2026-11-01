// The names of the Docker images an execution builds, and of the containers it runs. Every image
// and container name is made here.
import { abbreviateHash } from "../config/permutations.ts";

/** The prefix image names start with, unless `--image-prefix` gives another. */
export const DEFAULT_IMAGE_PREFIX = "thunderjar";

// A Docker repository name component: lowercase letters and digits, joined by single separators.
const NAME_COMPONENT = /^[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$/;

/** Why `prefix` can't start an image name, or undefined if it can. */
export function imagePrefixProblem(prefix: string): string | undefined {
  if (NAME_COMPONENT.test(prefix)) return undefined;
  return "must be lowercase letters and digits, joined by single separators (., _, __ or -), as a Docker repository name is.";
}

/** The repository every prerun image is tagged in. */
export const prerunRepository = (prefix: string = DEFAULT_IMAGE_PREFIX) => `${prefix}-prerun`;

/** The image a permutation's container runs start from: shared by every execution with its hash. */
export const prerunImage = (hash: string, prefix: string = DEFAULT_IMAGE_PREFIX) =>
  `${prerunRepository(prefix)}:${abbreviateHash(hash)}`;

/** The image one container run leaves behind. `permutation` and `iteration` count from 1. */
export const postrunImage = (
  executionId: string,
  permutation: number,
  iteration: number,
  prefix: string = DEFAULT_IMAGE_PREFIX,
) => `${prefix}-postrun:${executionId}-${permutation}-${iteration}`;

/** The container one container run runs in, until it's committed to its postrun image and removed. */
export const containerName = (
  executionId: string,
  permutation: number,
  iteration: number,
  prefix: string = DEFAULT_IMAGE_PREFIX,
) => `${prefix}-run-${executionId}-${permutation}-${iteration}`;
