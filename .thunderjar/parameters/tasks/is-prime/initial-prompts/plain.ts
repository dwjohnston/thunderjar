import { declareInitialPrompt, writePrompt } from "thunderjar-published";

export default declareInitialPrompt({
  applyParameter: () => writePrompt("Create a file isPrime.ts exporting a function that tests for primality."),
  timeoutSeconds: 600,
});
