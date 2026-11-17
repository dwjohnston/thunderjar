import { declareHarness, type TokenCosts, writeModel, writeRunScript } from "thunderjar-published";

// OpenCode, on OpenRouter. OpenCode's built-in openrouter provider reads OPENROUTER_API_KEY itself.
// A test case names a model as "openrouter/" plus its OpenRouter ID, e.g. "opencode-1.19.5/openrouter/anthropic/claude-haiku-5.5".
// Models come and go: check https://openrouter.ai/models for the current IDs.

// `opencode run --format json` writes one JSON event per line: {type, timestamp, sessionID, part}.
// The reply is in "text" events and the tokens in "step_finish" events, one per model call. Only the
// main session's events are written, so sub-agents' tokens aren't counted.
type Part = {
  text?: unknown;
  cost?: unknown;
  tokens?: { input?: unknown; output?: unknown; reasoning?: unknown; cache?: { read?: unknown; write?: unknown } };
};
type Event = { type?: unknown; part?: Part };

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

/** The text of the last step, i.e. after the last "step_start": the agent's final reply. */
function opencodeReply(raw: string): string {
  const all = events(raw);
  const lastStep = all.findLastIndex((e) => e.type === "step_start");
  const texts = all.slice(lastStep + 1).flatMap((e) => (e.type === "text" && typeof e.part?.text === "string" ? [e.part.text] : []));
  if (texts.length === 0) throw new Error("no text event in OpenCode's JSON output");
  return texts.join("\n");
}

/**
 * Every step's tokens, summed. OpenCode already takes cached tokens out of `input`, but it takes
 * reasoning out of `output`, so reasoning is added back: it's billed as output. Its `cost` is its
 * own estimate in dollars, from the models.dev price table, not what OpenRouter charged.
 */
function opencodeTokenCosts(raw: string, ctx: { modelId: string }): TokenCosts {
  const all = events(raw);
  const steps = all.filter((e) => e.type === "step_finish");
  // OpenCode's events, but no step finished, e.g. its first model call failed (OpenRouter's 402,
  // out of credits): it reported no tokens. Only output with no events at all is unparseable.
  if (steps.length === 0) return { outcome: "unavailable", reason: all.length > 0 ? "notReported" : "unparseable" };
  let inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheCreationTokens = 0, costUsd = 0;
  for (const { part } of steps) {
    const t = part?.tokens;
    const values = [t?.input, t?.output, t?.reasoning, t?.cache?.read, t?.cache?.write].map(count);
    if (values.some((n) => n === undefined)) return { outcome: "unavailable", reason: "unparseable" };
    const [input, output, reasoning, read, write] = values as [number, number, number, number, number];
    inputTokens += input;
    outputTokens += output + reasoning;
    cacheReadTokens += read;
    cacheCreationTokens += write;
    costUsd += count(part?.cost) ?? 0;
  }
  if (inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens === 0) return { outcome: "unavailable", reason: "notReported" };
  // A model missing from OpenCode's price table costs 0 there, so 0 means "unknown", not free.
  const cost = costUsd > 0 ? { costUsd, costBasis: "list" as const } : {};
  return { outcome: "collected", models: [{ model: ctx.modelId, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, ...cost }] };
}

export default declareHarness({
  version: "1.19.5",
  applyParameter: (_config, ctx) =>
    [
      `RUN npm install -g opencode-ai@${ctx.version}`,
      "RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar",
      // As `node`, OpenCode's plugin package is installed where OpenCode looks for it. Otherwise
      // every run installs it as it starts: 175 MB of ~/.config and ~/.npm in each postrun image,
      // to commit and push. Before the model is written, so every model's image shares the layer.
      "USER node",
      `RUN mkdir -p ~/.config/opencode && cd ~/.config/opencode && echo '{"dependencies":{"@opencode-ai/plugin":"${ctx.version}"}}' > package.json && npm install --no-audit --no-fund && npm cache clean --force`,
      "USER root",
      writeModel(ctx.modelId),
      // The prompt and model are read from their files, so quotes and newlines reach the agent intact.
      // OPENCODE_PERMISSION: with nobody to ask, `opencode run` rejects a command that touches a path
      // outside /workspace (the external_directory permission), and then stops, exiting 0 with no reply.
      writeRunScript(
        `OPENCODE_PERMISSION='{"external_directory":"allow"}' opencode run --model "$(cat /thunderjar/model.txt)" --format json "$(cat /thunderjar/prompt.txt)" > /thunderjar/result.json`,
      ),
      "USER node",
    ].join("\n"),
  collectReply: opencodeReply,
  collectTokenCosts: opencodeTokenCosts,
  requiredEnv: ["OPENROUTER_API_KEY"],
});
