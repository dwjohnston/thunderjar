import { declareInitialPrompt, writePrompt } from "thunderjar";

// A timeout no agent could run within.
export default declareInitialPrompt({
  applyParameter: () => writePrompt("Create a file isPrime.ts exporting a function that tests for primality."),
  timeoutSeconds: 0,
});
