import { declareHarness, writeModel, writeRunScript } from "thunderjar";

// A fake agent that does its work and exits 0, but writes no result file.
export default declareHarness({
  version: "1.0.0",
  applyParameter: (_config, ctx) =>
    [
      writeModel(ctx.modelId),
      writeRunScript(
        `echo 'export const isPrime = (n: number) => n > 1;' > isPrime.ts`,
      ),
    ].join("\n"),
});
