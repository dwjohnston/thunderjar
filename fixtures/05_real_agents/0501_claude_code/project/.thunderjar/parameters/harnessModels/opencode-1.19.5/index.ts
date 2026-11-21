import { declareHarness, OPENCODE_TRANSCRIPT_COMMAND, opencodeTranscript, writeModel, writeRunScript } from "thunderjar";

// OpenCode, on OpenCode Zen. OPENCODE_API_KEY is an OpenCode Zen key. OpenCode keeps its sessions in a
// database, so once it's done, the run script writes them out as JSON, for opencodeTranscript to read,
// and exits as OpenCode did.
// A test case names a model by the ID the agent takes, e.g. "opencode-1.19.5/opencode/claude-haiku-5-5", "opencode-1.19.5/opencode/gpt-5.5".
// Models come and go: check https://opencode.ai/zen/v1/models for the current IDs.
export default declareHarness({
  version: "1.19.5",
  applyParameter: (_config, ctx) =>
    [
      `RUN npm install -g opencode-ai@${ctx.version}`,
      "RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar",
      writeModel(ctx.modelId),
      // The prompt and model are read from their files, so quotes and newlines reach the agent intact.
      writeRunScript(`opencode run --model "$(cat /thunderjar/model.txt)" --format json "$(cat /thunderjar/prompt.txt)" > /thunderjar/result.json; code=$?; ${OPENCODE_TRANSCRIPT_COMMAND}; exit $code`),
      "USER node",
    ].join("\n"),
  // Thunderjar has no reader for this agent's output yet. To measure its reply, and its token
  // costs, read them from what the run script wrote to /thunderjar/result.json:
  // collectReply: (raw) => …,
  // collectTokenCosts: (raw, ctx) => ({ outcome: "collected", models: [{ model: ctx.modelId, … }] }),
  // What the agent kept of its session, for instruments such as toolCalled.
  transcript: opencodeTranscript,
  requiredEnv: ["OPENCODE_API_KEY"],
});
