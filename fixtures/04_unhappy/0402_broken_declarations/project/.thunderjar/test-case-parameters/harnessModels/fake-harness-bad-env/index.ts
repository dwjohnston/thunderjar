import { declareHarness } from "thunderjar";

// A fake agent whose requiredEnv names a variable no shell could set, and isn't all strings.
export default declareHarness({
  cli: (ctx) => `echo '{}' > ${ctx.resultPath}`,
  requiredEnv: ["API KEY", 3],
});
