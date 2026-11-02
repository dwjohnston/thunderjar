import { declareTokenCostCollector } from "thunderjar";

// Thunderjar has no reader for Copilot CLI's output yet. `raw` is what the harness's `cli` wrote to
// its result path. To collect token costs, read them from it:
//
//   return {
//     outcome: "collected",
//     models: [{ model: ctx.modelId, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens }],
//   };
export default declareTokenCostCollector((_raw, _ctx) => ({ outcome: "unavailable", reason: "notReported" }));
