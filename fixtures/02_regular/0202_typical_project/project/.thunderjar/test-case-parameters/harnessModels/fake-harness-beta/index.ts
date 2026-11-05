import { declareHarness } from "thunderjar";

// A fake agent: writes a correct isPrime.ts, without a @ts-ignore, and a result file whose reply
// says it tested it.
// It needs nothing, but records in /thunderjar/fake-harness-key whether it saw alpha's FAKE_HARNESS_KEY: "set", or nothing.
export default declareHarness({
  applyParameter: (_config, ctx) => `RUN echo "install fake-harness-beta@${ctx.version}"`,
  cli: (ctx) =>
    `printf '%s\\n' '// ${ctx.initialPrompt}' 'export const isPrime = (n: number) => n > 1 && Array.from({ length: n - 2 }, (_, i) => i + 2).every((d) => n % d !== 0);' > isPrime.ts` +
    ` && echo '{"model":"${ctx.modelId}","reply":"I wrote isPrime.ts, and tested it up to 100."}' > ${ctx.resultPath}` +
    ` && echo "\${FAKE_HARNESS_KEY+set}" > /thunderjar/fake-harness-key`,
  collectReply: (raw) => (JSON.parse(raw) as { reply: string }).reply,
});
