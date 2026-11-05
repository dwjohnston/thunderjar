import { claudeCodeReply, claudeCodeTokenCosts, declareHarness } from "thunderjar";

// A fake agent: writes a buggy isPrime.ts (2 isn't prime, 15 is) with a @ts-ignore, and a result file
// shaped like Claude Code's, whose reply talks like a pirate, and which spent 12,480 tokens and $0.061.
// It needs FAKE_HARNESS_KEY, and records in /thunderjar/fake-harness-key whether it saw it: "set", or nothing.

/** What Claude Code's `--output-format json` would say, cut down to what's read. */
const result = (modelId: string) => ({
  type: "result",
  result: "Arr, isPrime.ts be written.",
  modelUsage: {
    [modelId]: { inputTokens: 12000, outputTokens: 400, cacheReadInputTokens: 80, cacheCreationInputTokens: 0, costUSD: 0.061, costBasis: "list" },
  },
});

export default declareHarness({
  version: "1.0.0",
  applyParameter: (_config, ctx) => `RUN echo "install fake-harness-alpha@${ctx.version}"`,
  cli: (ctx) =>
    `printf '%s\\n' '// ${ctx.initialPrompt}' '// @ts-ignore' 'export const isPrime = (n: number) => n > 1 && n % 2 !== 0;' > isPrime.ts` +
    ` && echo '${JSON.stringify(result(ctx.modelId))}' > ${ctx.resultPath}` +
    ` && echo "\${FAKE_HARNESS_KEY+set}" > /thunderjar/fake-harness-key`,
  requiredEnv: ["FAKE_HARNESS_KEY"],
  collectReply: claudeCodeReply,
  collectTokenCosts: claudeCodeTokenCosts,
});
