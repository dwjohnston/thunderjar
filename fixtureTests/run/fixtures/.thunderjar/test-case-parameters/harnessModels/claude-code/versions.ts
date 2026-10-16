import { declareHarnessVersions } from "thunderjar";

export default declareHarnessVersions({
  "2.1.283": { version: "2.1.283" },
  // A cli override, over more than one line.
  "2.2.0": {
    version: "2.2.0",
    cli: (ctx) => `cd /workspace\nclaude@${ctx.version} -p "${ctx.initialPrompt}" --model ${ctx.modelId} > ${ctx.resultPath}`,
  },
});
