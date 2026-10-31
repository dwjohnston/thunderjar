import { declarePromptSet } from "thunderjar";

// Copies the prompt file beside this declaration into /workspace.
export default declarePromptSet({
  applyParameter: (_config, ctx) => `COPY ${ctx.dir}/FAKE_INSTRUCTIONS.md /workspace/FAKE_INSTRUCTIONS.md`,
});
