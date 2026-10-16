import { declareHarness } from "thunderjar";

const IS_PRIME = [
  "export function isPrime(n: number): boolean {",
  "  // @ts-ignore",
  "  if (n < 1) return false;",
  "  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;",
  "  return true;",
  "}",
];

export default declareHarness({
  applyParameter: () => ``,
  cli: (ctx) =>
    `printf '%s\\n' "// ${ctx.initialPrompt}" ${IS_PRIME.map((line) => `'${line}'`).join(" ")} > isPrime.ts` +
    ` && echo '{"model":"${ctx.modelId}"}' > ${ctx.resultPath}`,
});
