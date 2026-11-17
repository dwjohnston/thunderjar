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

/**
 * What the name of every container of execution `executionId` starts with: its container runs',
 * and their measurement containers', which add `-measure-<n>`.
 */
export const executionContainerPrefix = (executionId: string, prefix: string = DEFAULT_IMAGE_PREFIX) => `${prefix}-run-${executionId}-`;

// In the image store, both kinds of image share one repository, told apart by their tag's prefix:
// see project-md/prd/081-docker-tagging.md.

/** Where a prerun image is pushed: `<repository>:prerun-h<abbreviated hash>`. */
export const storedPrerunImage = (repository: string, hash: string) => `${repository}:prerun-h${abbreviateHash(hash)}`;

/**
 * Where a postrun image is pushed: `<repository>:postrun-e<execution ID>-h<abbreviated hash>-i<iteration index>`.
 * `iteration` counts from 1; the tag's index counts from 0, two digits at least.
 */
export const storedPostrunImage = (repository: string, executionId: string, hash: string, iteration: number) =>
  `${repository}:postrun-e${executionId}-h${abbreviateHash(hash)}-i${String(iteration - 1).padStart(2, "0")}`;
