import { codexTranscript, declareHarness, type TokenCosts, writeModel, writeRunScript } from "thunderjar";

// OpenAI's Codex CLI, on OpenRouter, without its sandbox or approvals: the container is the sandbox.
// A custom model provider points Codex at OpenRouter's Responses API. It needs OPENROUTER_API_KEY.
// A test case names a model by its OpenRouter ID, e.g. "codex-0.166.0/openai/gpt-5.5".
// Models come and go: check https://openrouter.ai/models for the current IDs.
const OPENROUTER_PROVIDER =
  `-c model_provider=openrouter` +
  ` -c 'model_providers.openrouter={name="OpenRouter",base_url="https://openrouter.ai/api/v1",env_key="OPENROUTER_API_KEY",wire_api="responses"}'`;

type Event = { type?: unknown; item?: { type?: unknown; item_type?: unknown; text?: unknown }; usage?: Record<string, unknown> };

/** Each JSON line of `codex exec --json`'s output. Lines that aren't JSON objects are skipped. */
function events(raw: string): Event[] {
  return raw.split("\n").flatMap((line) => {
    try {
      const parsed = JSON.parse(line);
      return typeof parsed === "object" && parsed !== null ? [parsed as Event] : [];
    } catch {
      return [];
    }
  });
}

const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0);

/** The last completed agent message with text: its final reply. */
function codexReply(raw: string): string {
  const reply = events(raw)
    .filter((e) => e.type === "item.completed")
    .map((e) => e.item)
    .filter((item) => item?.type === "agent_message" || item?.item_type === "assistant_message")
    .map((item) => item?.text)
    .findLast((text) => typeof text === "string" && text.trim() !== "");
  if (typeof reply !== "string") throw new Error("no completed agent_message with text in Codex's JSONL output");
  return reply;
}

/** Tokens summed over every `turn.completed`. Codex's `input_tokens` include the cached ones, so they're subtracted. */
function codexTokenCosts(raw: string, modelId: string): TokenCosts {
  const usages = events(raw).flatMap((e) => (e.type === "turn.completed" && e.usage ? [e.usage] : []));
  if (usages.length === 0) return { outcome: "unavailable", reason: "notReported" };
  let input = 0, cached = 0, output = 0;
  for (const u of usages) {
    input += count(u.input_tokens);
    cached += count(u.cached_input_tokens);
    output += count(u.output_tokens);
  }
  if (input + output === 0) return { outcome: "unavailable", reason: "notReported" };
  return {
    outcome: "collected",
    models: [{ model: modelId, inputTokens: Math.max(0, input - cached), outputTokens: output, cacheReadTokens: cached, cacheCreationTokens: 0 }],
  };
}

export default declareHarness({
  version: "0.166.0",
  applyParameter: (_config, ctx) =>
    [
      `RUN npm install -g @openai/codex@${ctx.version}`,
      "RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar",
      writeModel(ctx.modelId),
      // The prompt and model are read from their files, so quotes and newlines reach the agent intact.
      writeRunScript(`codex exec ${OPENROUTER_PROVIDER} --model "$(cat /thunderjar/model.txt)" --json --dangerously-bypass-approvals-and-sandbox "$(cat /thunderjar/prompt.txt)" > /thunderjar/result.json`),
      "USER node",
    ].join("\n"),
  collectReply: codexReply,
  collectTokenCosts: (raw, ctx) => codexTokenCosts(raw, ctx.modelId),
  // Its rollouts, in ~/.codex/sessions/, a sub-agent's among them.
  transcript: codexTranscript,
  requiredEnv: ["OPENROUTER_API_KEY"],
});
