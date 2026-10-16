import { declareHarness } from "thunderjar";

export default declareHarness({
  applyParameter: (ctx) => `RUN npm install -g @openai/codex@${ctx.version}`,
  cli: (ctx) => `codex exec "${ctx.initialPrompt}" --model ${ctx.modelId} > ${ctx.resultPath}`,
  requiredEnv: ["OPENAI_API_KEY"],
});
