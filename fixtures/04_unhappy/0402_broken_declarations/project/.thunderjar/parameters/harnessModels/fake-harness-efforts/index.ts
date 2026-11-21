import { declareHarness, writeModel, writeRunScript } from "thunderjar";

// A fake agent that declares its models: one without settings, and one with an effort level to choose.
export default declareHarness({
  version: "1.0.0",
  models: {
    "fake/model-small": [],
    "fake/model-large": [{ effort: { values: ["low", "high"] } }],
  },
  applyParameter: (_config, ctx) =>
    [writeModel(ctx.modelId), writeRunScript(`echo '{"model":"${ctx.modelId}"}' > /thunderjar/result.json`)].join("\n"),
});
