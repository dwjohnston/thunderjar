/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiFLaxJLiUMbmTp2fu
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */
// Reading what `opencode run --format json` writes: one JSON event per line, {type, timestamp,
// sessionID, part}. The reply is in "text" events and the tokens in "step_finish" events, one per
// model call. Only the main session's events are written, so sub-agents' tokens aren't counted.
// For a harness's `collectReply` and `collectTokenCosts`, so an OpenCode harness needn't parse it
// itself, and `opencode`, a whole OpenCode harness.
import { declareHarness, type HarnessDeclaration, type HarnessModels, type SettingValue, type TokenCosts } from "./declarations.ts";
import { writeModel, writeRunScript } from "./files.ts";
import { COMMAND_PATHS, type CommandContext, type CommandProvider, envAssignments, type HelperOptions } from "./harnessOptions.ts";
import { jsonLines, tokenCount } from "./jsonLines.ts";

type Part = {
  text?: unknown;
  cost?: unknown;
  tokens?: { input?: unknown; output?: unknown; reasoning?: unknown; cache?: { read?: unknown; write?: unknown } };
};
type Event = { type?: unknown; part?: Part };

/** The text of the last step, i.e. after the last "step_start": the agent's final reply. Throws if there is none. */
export function opencodeReply(raw: string): string {
  const all = jsonLines<Event>(raw);
  const lastStep = all.findLastIndex((e) => e.type === "step_start");
  const texts = all.slice(lastStep + 1).flatMap((e) => (e.type === "text" && typeof e.part?.text === "string" ? [e.part.text] : []));
  if (texts.length === 0) throw new Error("no text event in OpenCode's JSON output");
  return texts.join("\n");
}
/**
 * Every step's tokens, summed, as one entry for `modelId`. OpenCode already takes cached tokens out
 * of `input`, but it takes reasoning out of `output`, so reasoning is added back: it's billed as
 * output. Its `cost` is its own estimate in dollars, from the models.dev price table, not what the
 * provider charged. OpenCode's events with no finished step, e.g. its first model call failed
 * (OpenRouter's 402, out of credits), are `notReported`; output with no events at all, or a step
 * without its tokens, `unparseable`.
 */
export function opencodeTokenCosts(raw: string, modelId: string): TokenCosts {
  const all = jsonLines<Event>(raw);
  const steps = all.filter((e) => e.type === "step_finish");
  if (steps.length === 0) return { outcome: "unavailable", reason: all.length > 0 ? "notReported" : "unparseable" };
  let inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheCreationTokens = 0, costUsd = 0;
  for (const { part } of steps) {
    const t = part?.tokens;
    const values = [t?.input, t?.output, t?.reasoning, t?.cache?.read, t?.cache?.write].map(tokenCount);
    if (values.some((n) => n === undefined)) return { outcome: "unavailable", reason: "unparseable" };
    const [input, output, reasoning, read, write] = values as [number, number, number, number, number];
    inputTokens += input;
    outputTokens += output + reasoning;
    cacheReadTokens += read;
    cacheCreationTokens += write;
    costUsd += tokenCount(part?.cost) ?? 0;
  }
  if (inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens === 0) return { outcome: "unavailable", reason: "notReported" };
  // A model missing from OpenCode's price table costs 0 there, so 0 means "unknown", not free.
  const cost = costUsd > 0 ? { costUsd, costBasis: "list" as const } : {};
  return { outcome: "collected", models: [{ model: modelId, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, ...cost }] };
}

/** The models `opencode` declares unless given others: OpenCode Zen's, provider first, as OpenCode takes them. */
export const OPENCODE_MODELS: OpenCodeModels = {
  "opencode/claude-haiku-5-5": [],
  "opencode/gpt-5.5": [],
};

/** A value in a model's OpenCode config: fixed, or a variant, which adds one part to the pair's name. */
type ConfigValue = SettingValue | { values: readonly SettingValue[] };

/**
 * One setting of a model, in OpenCode's own per-model config: its `options`, passed to the
 * provider, e.g. `{ options: { reasoningEffort: { values: ["low", "high"] } } }`, or its `limit`,
 * e.g. `{ limit: { context: 200000 } }`.
 */
export type OpenCodeModelSetting = { options?: Record<string, ConfigValue>; limit?: Record<string, ConfigValue> };

/** `opencode`'s models: each model ID, provider first, and its settings, one per entry. */
export type OpenCodeModels = Record<string, readonly OpenCodeModelSetting[]>;

/** A model's config, as OpenCode takes it, each variant's value chosen: what `command` gets as `ctx.model`. */
export type OpenCodeModelConfig = { options?: Record<string, SettingValue>; limit?: Record<string, SettingValue> };

const GROUPS = ["options", "limit"] as const;

/**
 * `models` as `declareHarness` takes them: one setting per leaf, named `<group>.<key>`, e.g.
 * `options.reasoningEffort`, in order, so variants make the same names.
 */
const flatModels = (models: OpenCodeModels): HarnessModels =>
  Object.fromEntries(
    Object.entries(models).map(([id, settings]) => [
      id,
      settings.flatMap((setting) => GROUPS.flatMap((group) => Object.entries(setting[group] ?? {}).map(([key, value]) => ({ [`${group}.${key}`]: value })))),
    ]),
  );

/** `ctx.model`'s `<group>.<key>` settings back as OpenCode's config. */
function modelConfig(model: Record<string, SettingValue>): OpenCodeModelConfig {
  const config: OpenCodeModelConfig = {};
  for (const [name, value] of Object.entries(model)) {
    const [group, key] = name.split(/\.(.*)/s) as [string, string | undefined];
    if (key === undefined || !(GROUPS as readonly string[]).includes(group)) continue;
    (config[group as (typeof GROUPS)[number]] ??= {})[key] = value;
  }
  return config;
}

/**
 * OpenCode's config for a run, or undefined if it needs none: the model's own config, under its
 * provider, the part of its ID before the first `/`. Given a provider, that entry sets it up as an
 * OpenAI-compatible one, on Chat Completions, its key read from its variable as `{env:…}`.
 */
function runConfig(modelId: string, model: OpenCodeModelConfig, provider: CommandProvider | undefined): Record<string, unknown> | undefined {
  if (!provider && Object.keys(model).length === 0) return undefined;
  const [providerId, modelName] = modelId.split(/\/(.*)/s) as [string, string | undefined];
  const setup = provider && {
    npm: "@ai-sdk/openai-compatible",
    name: provider.name ?? providerId,
    options: { baseURL: provider.baseUrl, apiKey: `{env:${provider.apiKeyEnv}}` },
  };
  return { provider: { [providerId]: { ...setup, models: { [modelName ?? providerId]: model } } } };
}

/** What `opencode` gets. `models` take OpenCode's own per-model config. */
export type OpenCodeOptions = HelperOptions<OpenCodeModels, OpenCodeModelConfig>;

/**
 * The command that runs OpenCode: the prompt and model read from their files, so quotes and
 * newlines reach the agent intact, its events as JSON lines. `OPENCODE_PERMISSION` allows paths
 * outside /workspace: with nobody to ask, `opencode run` otherwise rejects a command that touches
 * one (the external_directory permission), then stops, exiting 0 with no reply. A model's own
 * config is passed in `OPENCODE_CONFIG_CONTENT`, which OpenCode merges into its config.
 */
export const OPENCODE_COMMAND = ({ modelId, model, paths, provider }: CommandContext<OpenCodeModelConfig>): string => {
  const config = runConfig(modelId, model, provider);
  return (
    envAssignments({ OPENCODE_PERMISSION: JSON.stringify({ external_directory: "allow" }), ...(config && { OPENCODE_CONFIG_CONTENT: JSON.stringify(config) }) }) +
    ` opencode run --model "$(cat ${paths.model})" --format json "$(cat ${paths.prompt})" > ${paths.result}`
  );
};

/**
 * A complete harness declaration for OpenCode `version`. Its fragment installs OpenCode as root,
 * and its plugin package as `node`, where OpenCode looks for it: otherwise every run installs it
 * as it starts, 175 MB of ~/.config and ~/.npm in each postrun image. That's before the model is
 * written, so every model's image shares the layer. Then it writes the model ID and the run
 * script, and switches to `node`. Its reply and token costs are read from its JSON lines. It
 * needs `OPENCODE_API_KEY`, an OpenCode Zen key.
 *
 * ```ts
 * // harnessModels/opencode-1.19.5/index.ts
 * export default opencode({ version: "1.19.5" });
 * ```
 */
export function opencode({ version, models = OPENCODE_MODELS, provider, command = OPENCODE_COMMAND }: OpenCodeOptions): HarnessDeclaration<undefined, undefined> {
  return declareHarness({
    version,
    models: flatModels(models),
    applyParameter: (_config, ctx) =>
      [
        `RUN npm install -g opencode-ai@${ctx.version}`,
        "RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar",
        "USER node",
        `RUN mkdir -p ~/.config/opencode && cd ~/.config/opencode && echo '{"dependencies":{"@opencode-ai/plugin":"${ctx.version}"}}' > package.json && npm install --no-audit --no-fund && npm cache clean --force`,
        "USER root",
        writeModel(ctx.modelId),
        writeRunScript(command({ modelId: ctx.modelId, model: modelConfig(ctx.model), version: ctx.version, paths: COMMAND_PATHS, provider: provider && { ...provider, wireApi: "chat" } })),
        "USER node",
      ].join("\n"),
    collectReply: opencodeReply,
    collectTokenCosts: (raw, ctx) => opencodeTokenCosts(raw, ctx.modelId),
    requiredEnv: provider ? [provider.apiKeyEnv] : ["OPENCODE_API_KEY"],
  });
}
