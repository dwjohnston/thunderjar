import { declareHarness, writeModel, writeRunScript } from "thunderjar";

// A fake agent whose requiredEnv names a variable no shell could set, and isn't all strings.
export default declareHarness({
  models: { "fake-model-small-001": [], "fake-model-large-001": [] },
  version: "1.0.0",
  applyParameter: (_config, ctx) =>
    [
      writeModel(ctx.modelId),
      writeRunScript(
        `echo '{}' > /thunderjar/result.json`,
      ),
    ].join("\n"),
  requiredEnv: ["API KEY", 3],
});
