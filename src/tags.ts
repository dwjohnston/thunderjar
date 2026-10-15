// Docker image tags — spec/081-docker-tagging.md#tag-formats.

import { abbreviateHash } from "./hashing.ts";

/** A permutation's prerun image tag: `prerun-h<abbreviated permutation hash>`. */
export const prerunTag = (permutationHash: string) => `prerun-h${abbreviateHash(permutationHash)}`;

/**
 * One container run's postrun image tag:
 * `postrun-e<execution ID>-h<abbreviated permutation hash>-i<iteration index>`. The execution
 * ID is kept full length; the iteration index counts from 0, zero-padded to two digits.
 */
export const postrunTag = (executionId: string, permutationHash: string, iterationIndex: number) =>
  `postrun-e${executionId}-h${abbreviateHash(permutationHash)}-i${String(iterationIndex).padStart(2, "0")}`;
