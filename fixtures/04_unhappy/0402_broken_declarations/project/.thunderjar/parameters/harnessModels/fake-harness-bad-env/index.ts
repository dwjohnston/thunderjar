import { declareHarness, writeModel, writeRunScript } from "thunderjar";

// A fake agent whose requiredEnv names a variable no shell could set, and isn't all strings.
export default declareHarness({
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
