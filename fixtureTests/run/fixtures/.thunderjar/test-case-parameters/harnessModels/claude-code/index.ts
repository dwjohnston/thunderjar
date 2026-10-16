import { declareHarness } from "thunderjar";

export default declareHarness({
  applyParameter: (ctx) => `RUN npm install -g @anthropic-ai/claude-code@${ctx.version}`,
  cli: (ctx) => `claude -p "${ctx.initialPrompt}" --model ${ctx.modelId} > ${ctx.resultPath}`,
  requiredEnv: ["ANTHROPIC_API_KEY"],
});
