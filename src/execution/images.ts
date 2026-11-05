// The names of the Docker images an execution builds. Every image name is made here.
import { abbreviateHash } from "../config/permutations.ts";

/** The image a permutation's container runs start from: shared by every execution with its hash. */
export const prerunImage = (hash: string) => `thunderjar-prerun:${abbreviateHash(hash)}`;

/** The image one container run leaves behind. `permutation` and `iteration` count from 1. */
export const postrunImage = (executionId: string, permutation: number, iteration: number) =>
  `thunderjar-postrun:${executionId}-${permutation}-${iteration}`;
