// Docker image tags — spec/081-docker-tagging.md#tag-formats.

import { abbreviateHash } from "./hashing.ts";

/** A permutation's prerun image tag: `prerun-h<abbreviated permutation hash>`. */
export const prerunTag = (permutationHash: string) => `prerun-h${abbreviateHash(permutationHash)}`;
