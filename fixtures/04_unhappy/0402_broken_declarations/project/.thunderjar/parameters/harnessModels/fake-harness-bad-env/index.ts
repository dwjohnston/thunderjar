import { declareHarness } from "thunderjar";

// A fake agent whose requiredEnv names a variable no shell could set, and isn't all strings.
export default declareHarness({
  version: "1.0.0",
  cli: (ctx) => `echo '{}' > ${ctx.resultPath}`,
  requiredEnv: ["API KEY", 3],
});
