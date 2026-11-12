import { declareHarness } from "thunderjar";

// A fake agent that crashes: it writes a result file and says why on stderr, then exits 1,
// leaving no isPrime.ts.
export default declareHarness({
  version: "1.0.0",
  cli: (ctx) => `echo '{"error":"crashed"}' > ${ctx.resultPath} && echo 'fake-crasher: no space left on device' >&2 && exit 1`,
});
