import { declareHarness } from "thunderjar";

// Writes a correct isPrime.ts, without a @ts-ignore, and a result file.
export default declareHarness({
  applyParameter: (ctx) => `RUN echo "install fake-harness-beta@${ctx.version}"`,
  cli: (ctx) =>
    `printf '%s\\n' '// ${ctx.initialPrompt}' 'export const isPrime = (n: number) => n > 1 && Array.from({ length: n - 2 }, (_, i) => i + 2).every((d) => n % d !== 0);' > isPrime.ts` +
    ` && echo '{"model":"${ctx.modelId}"}' > ${ctx.resultPath}`,
});
