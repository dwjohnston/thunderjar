import { declareHarness, writeModel, writeRunScript } from "thunderjar";

// A fake agent: writes a buggy isPrime.ts (2 isn't prime, 15 is) with a @ts-ignore, and a result file.
export default declareHarness({
  version: "1.0.0",
  applyParameter: (_config, ctx) =>
    [
      `RUN echo "install fake-harness-alpha@${ctx.version}"`,
      writeModel(ctx.modelId),
      writeRunScript(
        `printf '%s\\n' "// $(cat /thunderjar/prompt.txt)" '// @ts-ignore' 'export const isPrime = (n: number) => n > 1 && n % 2 !== 0;' > isPrime.ts` +
        ` && echo '{"model":"${ctx.modelId}"}' > /thunderjar/result.json`,
      ),
    ].join("\n"),
});
