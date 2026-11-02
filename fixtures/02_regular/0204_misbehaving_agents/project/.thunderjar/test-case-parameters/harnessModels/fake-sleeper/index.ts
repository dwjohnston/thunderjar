import { declareHarness } from "thunderjar";

// A fake agent that hangs: it would sleep far past its initial prompt's timeout before doing anything.
export default declareHarness({
  cli: (ctx) => `sleep 300 && echo 'export const isPrime = (n: number) => n > 1;' > isPrime.ts && echo '{}' > ${ctx.resultPath}`,
});
