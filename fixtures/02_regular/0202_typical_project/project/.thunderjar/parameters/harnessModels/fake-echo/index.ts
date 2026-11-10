import { declareHarness } from "thunderjar";

// A fake agent that does nothing but copy the prompt file it was given into its result file.
export default declareHarness({
  version: "1.0.0",
  cli: (ctx) => `cat ${ctx.promptPath} > ${ctx.resultPath}`,
});
