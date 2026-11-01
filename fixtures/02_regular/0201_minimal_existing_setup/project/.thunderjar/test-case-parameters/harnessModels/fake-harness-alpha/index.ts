import { declareHarness } from "thunderjar";

// A fake agent: writes a buggy isPrime.ts (2 isn't prime, 15 is) with a @ts-ignore, and a result file.
export default declareHarness({
  applyParameter: (_config, ctx) => `RUN echo "install fake-harness-alpha@${ctx.version}"`,
  cli: (ctx) =>
    `printf '%s\\n' '// ${ctx.initialPrompt}' '// @ts-ignore' 'export const isPrime = (n: number) => n > 1 && n % 2 !== 0;' > isPrime.ts` +
    ` && echo '{"model":"${ctx.modelId}"}' > ${ctx.resultPath}`,
});
