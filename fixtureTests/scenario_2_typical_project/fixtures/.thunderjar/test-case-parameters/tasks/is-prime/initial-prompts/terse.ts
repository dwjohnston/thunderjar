import { declareInitialPrompt } from "thunderjar";

export default declareInitialPrompt({
  prompt: "isPrime.ts: export a primality test.",
  timeoutSeconds: 600,
  applyParameter: () => ``,
});
