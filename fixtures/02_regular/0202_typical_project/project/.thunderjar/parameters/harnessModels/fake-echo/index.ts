import { declareHarness, writeModel, writeRunScript } from "thunderjar";

// A fake agent that does nothing but copy the prompt file it was given into its result file.
export default declareHarness({
  models: { "fake-model-small-001": [], "fake-model-large-001": [] },
  version: "1.0.0",
  applyParameter: (_config, ctx) =>
    [
      writeModel(ctx.modelId),
      writeRunScript(
        `cat /thunderjar/prompt.txt > /thunderjar/result.json`,
      ),
    ].join("\n"),
});
