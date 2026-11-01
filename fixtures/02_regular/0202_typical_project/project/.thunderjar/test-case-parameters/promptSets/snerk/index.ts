import { declarePromptSet } from "thunderjar";

export default declarePromptSet({
  applyParameter: () => `RUN echo "Write small functions, and say what each one is for." > /workspace/FAKE_INSTRUCTIONS.md`,
});
