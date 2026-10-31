import { declareHarnessVersions } from "thunderjar";

export default declareHarnessVersions({
  "1.0.0": { version: "1.0.0" },
  // Overrides the family's cli, over more than one line: records its version, then does the same.
  "1.1.0": {
    version: "1.1.0",
    cli: (ctx) =>
      `echo "fake-harness-alpha@${ctx.version}" > version.txt\n` +
      `printf '%s\\n' '// ${ctx.initialPrompt}' '// @ts-ignore' 'export const isPrime = (n: number) => n > 1 && n % 2 !== 0;' > isPrime.ts` +
      ` && echo '{"model":"${ctx.modelId}"}' > ${ctx.resultPath}`,
  },
});
