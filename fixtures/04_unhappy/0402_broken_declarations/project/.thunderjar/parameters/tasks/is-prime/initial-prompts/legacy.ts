import { declareInitialPrompt } from "thunderjar";

// The old way: a prompt given as a field, not written by the fragment.
export default declareInitialPrompt({
  // @ts-expect-error `prompt` is no longer a field: write it with writePrompt.
  prompt: "Create a file isPrime.ts exporting a function that tests for primality.",
  timeoutSeconds: 600,
});
