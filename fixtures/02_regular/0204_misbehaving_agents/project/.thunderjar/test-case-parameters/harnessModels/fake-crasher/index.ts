import { declareHarness } from "thunderjar";

// A fake agent that crashes: it writes a result file, then exits 1, leaving no isPrime.ts.
export default declareHarness({
  version: "1.0.0",
  cli: (ctx) => `echo '{"error":"crashed"}' > ${ctx.resultPath} && exit 1`,
});
