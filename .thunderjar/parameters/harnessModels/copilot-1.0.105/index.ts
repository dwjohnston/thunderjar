import { declareHarness, type ModelTokenCosts, type TokenCosts, writeModel, writeRunScript } from "thunderjar-published";

// GitHub Copilot CLI, in BYOK mode on OpenRouter: setting COPILOT_PROVIDER_BASE_URL makes it skip
// GitHub auth and Copilot's model routing. It needs OPENROUTER_API_KEY.
// A test case names a model by its OpenRouter ID, e.g. "copilot-1.0.105/anthropic/claude-haiku-5.5".
// The part after the last "/" is also given as the well-known model ID, so Copilot applies its
// model-specific settings (tool support, token limits). Run `copilot help providers` for the details.
// Models come and go: check https://openrouter.ai/models for the current IDs.

// Copilot's JSONL output (`--output-format json`) leaves out its token events, so the run script also has it
// write its usage statistics to a file, and appends them to the result file as one more line:
// {"type":"thunderjar.usage","data":<the usage file>}.
const USAGE_TYPE = "thunderjar.usage";
const USAGE_FILE = "/tmp/copilot-usage.json";

type Event = { type?: unknown; agentId?: unknown; data?: Record<string, unknown> };

/** Each JSON line of a result file. Lines that aren't JSON objects are skipped. */
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

const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined);

/** The main agent's last message with text: its final reply. Sub-agents' messages have an agentId. */
function copilotReply(raw: string): string {
  const messages = events(raw).filter((e) => e.type === "assistant.message" && e.agentId === undefined);
  const reply = messages.map((e) => e.data?.content).findLast((content) => typeof content === "string" && content.trim() !== "");
  if (typeof reply !== "string") throw new Error("no assistant.message with content in Copilot's JSONL output");
  return reply;
}

/**
 * Tokens per model, from the usage line the run script appended. Copilot's `inputTokens` include cached
 * reads and writes, so they're subtracted to fit Thunderjar's separate buckets. Its `cost` is a
 * premium-request multiplier, not dollars, so no cost is reported.
 */
function copilotTokenCosts(raw: string): TokenCosts {
  const usage = events(raw).findLast((e) => e.type === USAGE_TYPE)?.data;
  const metrics = usage?.modelMetrics;
  if (typeof metrics !== "object" || metrics === null) return { outcome: "unavailable", reason: "unparseable" };
  const models: ModelTokenCosts[] = [];
  for (const [model, metric] of Object.entries(metrics as Record<string, { usage?: Record<string, unknown> }>)) {
    const [input, output, cacheRead, cacheWrite] = ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens"].map((k) => count(metric.usage?.[k]));
    if ([input, output, cacheRead, cacheWrite].some((n) => n === undefined)) return { outcome: "unavailable", reason: "unparseable" };
    models.push({
      model,
      inputTokens: Math.max(0, input! - cacheRead! - cacheWrite!),
      outputTokens: output!,
      cacheReadTokens: cacheRead!,
      cacheCreationTokens: cacheWrite!,
    });
  }
  const total = models.reduce((sum, m) => sum + m.inputTokens + m.outputTokens + m.cacheCreationTokens + m.cacheReadTokens, 0);
  if (total === 0) return { outcome: "unavailable", reason: "notReported" };
  const apiDurationMs = count(usage?.totalApiDurationMs);
  return { outcome: "collected", models, ...(apiDurationMs !== undefined && { apiDurationMs }) };
}

export default declareHarness({
  version: "1.0.105",
  applyParameter: (_config, ctx) =>
    [
      `RUN npm install -g @github/copilot@${ctx.version}`,
      "RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar",
      // As `node`, Copilot is run once, so it unpacks itself into ~/.cache/copilot in the image.
      // Otherwise every run does: 500 MB in each postrun image, to commit and push. Before the
      // model is written, so every model's image shares the layer.
      "USER node",
      "RUN copilot --version",
      "USER root",
      writeModel(ctx.modelId),
      // The prompt and model are read from their files, so quotes and newlines reach the agent intact.
      // Copilot's exit code is kept as the script's, after the usage line is appended.
      writeRunScript(
        `rm -f ${USAGE_FILE}; ` +
          `COPILOT_PROVIDER_BASE_URL=https://openrouter.ai/api/v1 COPILOT_PROVIDER_API_KEY="$OPENROUTER_API_KEY"` +
          ` COPILOT_PROVIDER_MODEL_ID=${ctx.modelId.split("/").pop()}` +
          // OpenAI's GPT models take Copilot's tools only over the responses API: over chat completions,
          // the default, every call fails with 400 "Missing required parameter: 'tools[4].name'".
          `${ctx.modelId.startsWith("openai/") ? " COPILOT_PROVIDER_WIRE_API=responses" : ""}` +
          ` copilot -p "$(cat /thunderjar/prompt.txt)" --model "$(cat /thunderjar/model.txt)" --allow-all-tools --no-color` +
          ` --output-format json --usage-output-file ${USAGE_FILE} > /thunderjar/result.json; code=$?; ` +
          `[ -f ${USAGE_FILE} ] && printf '{"type":"${USAGE_TYPE}","data":%s}\\n' "$(tr -d '\\n' < ${USAGE_FILE})" >> /thunderjar/result.json; ` +
          `exit $code`,
      ),
      "USER node",
    ].join("\n"),
  collectReply: copilotReply,
  collectTokenCosts: copilotTokenCosts,
  requiredEnv: ["OPENROUTER_API_KEY"],
});
