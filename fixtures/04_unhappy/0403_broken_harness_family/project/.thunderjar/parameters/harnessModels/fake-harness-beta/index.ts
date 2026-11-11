import { declareHarness, writeModel, writeRunScript } from "thunderjar";

// A fake agent: writes a correct isPrime.ts, without a @ts-ignore, and a result file. Broken: it
// declares no version, which every harness must.
export default declareHarness({
  applyParameter: (_config, ctx) =>
    [
      `RUN echo "install fake-harness-beta@${ctx.version}"`,
      writeModel(ctx.modelId),
      writeRunScript(
        `printf '%s\\n' "// $(cat /thunderjar/prompt.txt)" 'export const isPrime = (n: number) => n > 1 && Array.from({ length: n - 2 }, (_, i) => i + 2).every((d) => n % d !== 0);' > isPrime.ts` +
        ` && echo '{"model":"${ctx.modelId}"}' > /thunderjar/result.json`,
      ),
    ].join("\n"),
});
