import { declareHarness } from "thunderjar";

// A fake agent that does its work and exits 0, but writes no result file.
export default declareHarness({
  cli: () => `echo 'export const isPrime = (n: number) => n > 1;' > isPrime.ts`,
});
