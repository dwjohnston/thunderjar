import { declarePromptSet } from "thunderjar";

export default declarePromptSet({
  applyParameter: () => `RUN echo "Prefer one clear expression to a loop." > /workspace/FAKE_INSTRUCTIONS.md`,
});
