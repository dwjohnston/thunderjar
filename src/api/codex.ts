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
// Reading what `codex exec --json` writes: JSON lines, one event each. For a harness's
// `collectReply`, `collectTokenCosts` and `collectSkillsInvoked`, so a Codex harness needn't parse
// it itself, and `codex`, a whole Codex harness.
//
// Codex has no skill tool: its prompt lists each skill's SKILL.md, and the agent reads the one it
// wants with a shell command, which Codex's own telemetry counts as an implicit invocation.
import { declareHarness, type HarnessDeclaration, type HarnessModels, type SkillsInvokedCollector, type TokenCosts } from "./declarations.ts";
import { writeModel, writeRunScript } from "./files.ts";
import { COMMAND_PATHS, type CommandContext, type CommandProvider, type HelperOptions, providerId, shellQuote } from "./harnessOptions.ts";
import { jsonLines, tokenCount } from "./jsonLines.ts";

type Event = { type?: unknown; item?: { type?: unknown; item_type?: unknown; text?: unknown; command?: unknown }; usage?: Record<string, unknown> };

/** The last completed agent message with text: Codex's final reply. Throws if there is none. */
export function codexReply(raw: string): string {
  const reply = jsonLines<Event>(raw)
    .filter((e) => e.type === "item.completed")
    .map((e) => e.item)
    .filter((item) => item?.type === "agent_message" || item?.item_type === "assistant_message")
    .map((item) => item?.text)
    .findLast((text) => typeof text === "string" && text.trim() !== "");
  if (typeof reply !== "string") throw new Error("no completed agent_message with text in Codex's JSONL output");
  return reply;
}

/**
 * Tokens summed over every `turn.completed`, as one entry for `modelId`: Codex doesn't name the
 * model. Its `input_tokens` include the cached ones, so they're subtracted. `notReported` if no
 * turn completed or none counted a token.
 */
export function codexTokenCosts(raw: string, modelId: string): TokenCosts {
  let input = 0, cached = 0, output = 0;
  for (const { type, usage } of jsonLines<Event>(raw)) {
    if (type !== "turn.completed" || !usage) continue;
    input += tokenCount(usage.input_tokens) ?? 0;
    cached += tokenCount(usage.cached_input_tokens) ?? 0;
    output += tokenCount(usage.output_tokens) ?? 0;
  }
  if (input + output === 0) return { outcome: "unavailable", reason: "notReported" };
  return {
    outcome: "collected",
    models: [{ model: modelId, inputTokens: Math.max(0, input - cached), outputTokens: output, cacheReadTokens: cached, cacheCreationTokens: 0 }],
  };
}

/** A path to a skill's SKILL.md in a command: the skill is its folder, e.g. `base` in `.agents/skills/base/SKILL.md`. */
const SKILL_FILE = /([\w.-]+)\/SKILL\.md\b/g;

/**
 * The skills whose SKILL.md a command read, by folder, each once, in the order first read. Each
 * completed `command_execution` counts, whether or not it succeeded, as each Skill tool call does
 * for Claude Code. A glob such as `*\/SKILL.md` names no skill, so listing them doesn't count.
 */
export function codexSkillsInvoked(raw: string): string[] {
  const skills = new Set<string>();
  for (const { type, item } of jsonLines<Event>(raw)) {
    if (type !== "item.completed" || item?.type !== "command_execution" || typeof item.command !== "string") continue;
    for (const [, skill] of item.command.matchAll(SKILL_FILE)) skills.add(skill as string);
  }
  return [...skills];
}

/**
 * The skills the agent invoked, read from its result, for a harness's `collectSkillsInvoked`.
 * Throws if the result has no events, e.g. Codex never started, so the run is skipped rather than
 * counted as invoking no skill.
 */
export const collectCodexSkillsInvoked: SkillsInvokedCollector = async ({ harnessResult }) => {
  if (jsonLines(harnessResult).length === 0) throw new Error("no events in Codex's JSONL output");
  return codexSkillsInvoked(harnessResult);
};

/** The reasoning efforts Codex takes, as `-c model_reasoning_effort=…`, for a model's `reasoningEffort` setting. */
export const CODEX_REASONING_EFFORTS = ["low", "medium", "high"] as const;

/** The models `codex` declares unless given others: OpenAI's, as Codex takes them. */
export const CODEX_MODELS: HarnessModels = {
  "gpt-6.1-sol": [{ reasoningEffort: { values: CODEX_REASONING_EFFORTS } }],
  "gpt-5.5": [{ reasoningEffort: { values: CODEX_REASONING_EFFORTS } }],
};

/** What `codex` gets: `version` is `@openai/codex`'s, `command` is `CODEX_COMMAND` by default, and `models` `CODEX_MODELS`. */
export type CodexOptions = HelperOptions;

/**
 * The flags that point Codex at `provider`: a `model_providers` entry, its ID from its host, e.g.
 * `openrouter`, on the Responses API, which is all Codex speaks.
 */
const providerFlags = (provider: CommandProvider) => {
  const id = providerId(provider.baseUrl);
  const entry = { name: provider.name ?? id, base_url: provider.baseUrl, env_key: provider.apiKeyEnv, wire_api: provider.wireApi };
  const table = `{${Object.entries(entry).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(",")}}`;
  return `-c model_provider=${id} -c ${shellQuote(`model_providers.${id}=${table}`)}`;
};

/**
 * The command that runs Codex: the prompt and model read from their files, so quotes and newlines
 * reach the agent intact, its events as JSON lines, without its sandbox or approvals: the
 * container is the sandbox. At the model's `reasoningEffort`, if it has one. Given a provider, it
 * points Codex at it.
 */
export const CODEX_COMMAND = ({ model, paths, provider }: CommandContext): string =>
  `codex exec${provider ? ` ${providerFlags(provider)}` : ""}` +
  `${model.reasoningEffort === undefined ? "" : ` -c model_reasoning_effort=${model.reasoningEffort}`}` +
  ` --model "$(cat ${paths.model})" --json --dangerously-bypass-approvals-and-sandbox "$(cat ${paths.prompt})" > ${paths.result}`;

/**
 * A complete harness declaration for Codex `version`. Its fragment installs Codex as root, writes
 * the model ID and the run script, then switches to the image's non-root `node` user. Its reply,
 * token costs and the skills it invoked are read from its JSON lines. It needs `OPENAI_API_KEY`, or, given a
 * `provider`, which must speak the Responses API, only the provider's key.
 *
 * ```ts
 * // harnessModels/codex-0.166.0/index.ts
 * export default codex({ version: "0.166.0" });
 *
 * export default codex({
 *   version: "0.166.0",
 *   provider: OPENROUTER,
 *   models: { "openai/gpt-6.1-sol": [{ reasoningEffort: { values: ["low", "high"] } }] },
 * });
 * ```
 */
export function codex({ version, models = CODEX_MODELS, provider, command = CODEX_COMMAND, requiredEnv }: CodexOptions): HarnessDeclaration<undefined, undefined> {
  const commandProvider: CommandProvider | undefined = provider && { ...provider, wireApi: "responses" };
  return declareHarness({
    version,
    models,
    applyParameter: (_config, ctx) =>
      [
        `RUN npm install -g @openai/codex@${ctx.version}`,
        "RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar",
        writeModel(ctx.modelId),
        writeRunScript(command({ modelId: ctx.modelId, model: ctx.model, version: ctx.version, paths: COMMAND_PATHS, provider: commandProvider })),
        "USER node",
      ].join("\n"),
    collectReply: codexReply,
    collectTokenCosts: (raw, ctx) => codexTokenCosts(raw, ctx.modelId),
    collectSkillsInvoked: collectCodexSkillsInvoked,
    requiredEnv: requiredEnv ?? (provider ? [provider.apiKeyEnv] : ["OPENAI_API_KEY"]),
  });
}
