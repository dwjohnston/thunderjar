import { declareHarness, writeModel, writeRunScript } from "thunderjar";

// A fake agent: writes a buggy isPrime.ts (2 isn't prime, 15 is) with a @ts-ignore, and a result file.
// It "invokes" two skills, logging each one's name to /thunderjar/skills.log, a line each, where
// its collectSkillsInvoked reads them back for the skillInvoked instrument.
export default declareHarness({
  models: {
    "fake-model-small-001": [],
    // An effort level: a pair names one, e.g. "fake-harness-alpha/fake-model-effort-001/high".
    "fake-model-effort-001": [{ effort: { values: ["low", "high"] } }],
    // An effort level and two other variants, one part each, in this order.
    "fake-model-tuned-001": [
      { effort: { values: ["low", "high"] } },
      { temperature: { values: [0, 1] } },
      { mode: { values: ["fast", "careful"] } },
    ],
  },
  version: "1.0.0",
  applyParameter: (_config, ctx) =>
    [
      `RUN echo "install fake-harness-alpha@${ctx.version}"`,
      writeModel(ctx.modelId),
      writeRunScript(
        `printf '%s\\n' "// $(cat /thunderjar/prompt.txt)" '// @ts-ignore' 'export const isPrime = (n: number) => n > 1 && n % 2 !== 0;' > isPrime.ts` +
        ` && echo '{"model":"${ctx.modelId}"}' > /thunderjar/result.json` +
        ` && printf '%s\\n' tdd is-prime-hints > /thunderjar/skills.log`,
      ),
    ].join("\n"),
  // Run in the measurement container, from the postrun image, so the log the run script left is there.
  collectSkillsInvoked: async ({ readFile }) => (await readFile("/thunderjar/skills.log")).split("\n").filter(Boolean),
});
