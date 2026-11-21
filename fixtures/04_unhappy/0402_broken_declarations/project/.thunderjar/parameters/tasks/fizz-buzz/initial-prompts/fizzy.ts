import { declareInitialPrompt, writePrompt } from "thunderjar";

export default declareInitialPrompt({
  applyParameter: () => writePrompt("Create a file fizzBuzz.ts exporting a fizz buzz function."),
  timeoutSeconds: 600,
});
