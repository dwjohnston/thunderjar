import { declareHarness, writeModel, writeRunScript } from "thunderjar";

// A fake agent that declares no models.
export default declareHarness({
  version: "1.0.0",
  applyParameter: (_config, ctx) => [writeModel(ctx.modelId), writeRunScript("echo '{}' > /thunderjar/result.json")].join("\n"),
});
