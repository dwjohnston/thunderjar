import { declareCodeState } from "thunderjar";

// The seed repository's first commit (src/testing/seed-repo.ts): package.json and an empty
// lockfile, so `npm ci` needs no network.
export default declareCodeState({
  commit: "089b6a7a1688798c917f0b78535b0c8348a1dbae",
  applyParameter: () => `RUN npm ci`,
});
