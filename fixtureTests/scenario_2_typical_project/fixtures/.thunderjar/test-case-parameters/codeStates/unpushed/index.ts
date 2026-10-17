import { declareCodeState } from "thunderjar";

// A commit that isn't in the seed repository, as if it had never been pushed.
export default declareCodeState({
  commit: "a1b2c3",
  applyParameter: () => `RUN npm ci`,
});
