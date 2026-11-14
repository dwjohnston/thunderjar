import { declareHarness, writeModel, writeRunScript } from "thunderjar";

// A fake agent that hangs: it would sleep far past its initial prompt's timeout before doing anything.
export default declareHarness({
  version: "1.0.0",
  applyParameter: (_config, ctx) =>
    [
      writeModel(ctx.modelId),
      writeRunScript(
        `sleep 300 && echo 'export const isPrime = (n: number) => n > 1;' > isPrime.ts && echo '{}' > /thunderjar/result.json`,
      ),
    ].join("\n"),
});
