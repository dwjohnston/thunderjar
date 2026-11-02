import { declareHarness } from "thunderjar";

// A fake agent: writes a buggy isPrime.ts (2 isn't prime, 15 is) with a @ts-ignore, and a result file.
// It needs FAKE_HARNESS_KEY, and records in /thunderjar/fake-harness-key whether it saw it: "set", or nothing.
export default declareHarness({
  applyParameter: (_config, ctx) => `RUN echo "install fake-harness-alpha@${ctx.version}"`,
  cli: (ctx) =>
    `printf '%s\\n' '// ${ctx.initialPrompt}' '// @ts-ignore' 'export const isPrime = (n: number) => n > 1 && n % 2 !== 0;' > isPrime.ts` +
    ` && echo '{"model":"${ctx.modelId}"}' > ${ctx.resultPath}` +
    ` && echo "\${FAKE_HARNESS_KEY+set}" > /thunderjar/fake-harness-key`,
  requiredEnv: ["FAKE_HARNESS_KEY"],
});
