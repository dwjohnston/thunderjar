// Reading what `claude -p --output-format json` writes: one JSON object, with the reply as
// `result`, and the tokens and cost of each model it used as `modelUsage`. For a harness's
// `collectReply` and `collectTokenCosts`, so a Claude Code harness needn't parse it itself, and
// `claudeCode`, a whole Claude Code harness. And reading the skills it invoked, for
// `collectSkillsInvoked`: not from the result, which doesn't list tool calls, but from the session
// transcripts Claude Code keeps, one JSON object a line, under `~/.claude/projects/`.
//
// `modelUsage` is read, not the flat `usage`: `usage` counts only the top-level agent loop, so it
// leaves out what sub-agents spent. Its keys are camelCase, where `usage`'s are snake_case.
import { declareHarness, type HarnessDeclaration, type HarnessModels, type ModelTokenCosts, type SkillsInvokedCollector, type TokenCosts } from "./declarations.ts";
import { writeModel, writeRunScript } from "./files.ts";
import { COMMAND_PATHS, type CommandContext, type CommandProvider, envAssignments, envRef, type HelperOptions } from "./harnessOptions.ts";

type ModelUsage = {
  inputTokens?: unknown;
  outputTokens?: unknown;
  cacheReadInputTokens?: unknown;
  cacheCreationInputTokens?: unknown;
  costUSD?: unknown;
  costBasis?: unknown;
};

type ClaudeCodeResult = { type?: unknown; result?: unknown; modelUsage?: unknown; duration_api_ms?: unknown };

const COST_BASES = ["list", "managed", "unknown"] as const;

const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined);

/** `raw` parsed as Claude Code's result, or undefined if it isn't one. */
function parse(raw: string): ClaudeCodeResult | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  return typeof parsed === "object" && parsed !== null && (parsed as ClaudeCodeResult).type === "result"
    ? (parsed as ClaudeCodeResult)
    : undefined;
}

/** The agent's final reply, from the result file Claude Code wrote. Throws if it isn't one. */
export function claudeCodeReply(raw: string): string {
  const result = parse(raw)?.result;
  if (typeof result !== "string") throw new Error("not a result of `claude -p --output-format json`");
  return result;
}

/**
 * The tokens and cost of each model, from the result file Claude Code wrote. `unparseable` if it
 * isn't one, and `notReported` if it counts no tokens at all, as a crashed session's does. Its
 * cost is its own estimate, from a price table bundled with it: `costBasis` says whether that
 * table knew the model.
 */
export function claudeCodeTokenCosts(raw: string): TokenCosts {
  const result = parse(raw);
  if (!result || typeof result.modelUsage !== "object" || result.modelUsage === null) return { outcome: "unavailable", reason: "unparseable" };
  const models: ModelTokenCosts[] = [];
  for (const [model, usage] of Object.entries(result.modelUsage as Record<string, ModelUsage>)) {
    const tokens = [usage.inputTokens, usage.outputTokens, usage.cacheCreationInputTokens, usage.cacheReadInputTokens].map(count);
    if (tokens.some((n) => n === undefined)) return { outcome: "unavailable", reason: "unparseable" };
    const [inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens] = tokens as number[];
    const costUsd = count(usage.costUSD);
    const costBasis = COST_BASES.find((basis) => basis === usage.costBasis);
    models.push({
      model,
      inputTokens: inputTokens as number,
      outputTokens: outputTokens as number,
      cacheCreationTokens: cacheCreationTokens as number,
      cacheReadTokens: cacheReadTokens as number,
      ...(costUsd !== undefined && { costUsd }),
      ...(costBasis !== undefined && { costBasis }),
    });
  }
  const total = models.reduce((sum, m) => sum + m.inputTokens + m.outputTokens + m.cacheCreationTokens + m.cacheReadTokens, 0);
  if (total === 0) return { outcome: "unavailable", reason: "notReported" };
  const apiDurationMs = count(result.duration_api_ms);
  return { outcome: "collected", models, ...(apiDurationMs !== undefined && { apiDurationMs }) };
}

type TranscriptLine = { type?: unknown; message?: { content?: unknown } };
type ToolUse = { type?: unknown; name?: unknown; input?: { skill?: unknown } };

/**
 * The skills Claude Code's Skill tool was called with, in `transcripts`, the text of its session
 * transcripts, one JSON object a line: each once, in the order first called. A line that isn't
 * JSON, e.g. the last of a session killed mid-write, is skipped.
 */
export function claudeCodeSkillsInvoked(transcripts: string): string[] {
  const skills = new Set<string>();
  for (const line of transcripts.split("\n")) {
    if (!line.trim()) continue;
    let parsed: TranscriptLine;
    try {
      parsed = JSON.parse(line) as TranscriptLine;
    } catch {
      continue;
    }
    const content = parsed?.type === "assistant" ? parsed.message?.content : undefined;
    if (!Array.isArray(content)) continue;
    for (const block of content as ToolUse[]) {
      if (block?.type === "tool_use" && block.name === "Skill" && typeof block.input?.skill === "string") skills.add(block.input.skill);
    }
  }
  return [...skills];
}

/**
 * Every session transcript Claude Code wrote, sub-agents' too, in its config folder: `$HOME/.claude`,
 * or `CLAUDE_CONFIG_DIR` if set. Fails if there are none.
 */
const TRANSCRIPTS_COMMAND = `projects="\${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects"; [ -d "$projects" ] && find "$projects" -type f -name '*.jsonl' -exec cat {} + | grep .`;

/**
 * The skills the agent invoked, read in the measurement container from Claude Code's session
 * transcripts, for a harness's `collectSkillsInvoked`. Throws if it left none, e.g. it never
 * started, so the run is skipped rather than counted as invoking no skill.
 */
export const collectClaudeCodeSkillsInvoked: SkillsInvokedCollector = async ({ exec }) => {
  const { stdout, exitCode } = await exec(TRANSCRIPTS_COMMAND);
  if (exitCode !== 0) throw new Error("no Claude Code transcripts in ~/.claude/projects");
  return claudeCodeSkillsInvoked(stdout);
};

/** The models `claudeCode` declares unless given others: Anthropic's current IDs, as Claude Code takes them. */
export const CLAUDE_CODE_MODELS: HarnessModels = {
  "claude-fable-5-2": [],
  "claude-opus-5-5": [],
  "claude-sonnet-5-5": [],
  "claude-haiku-5-5": [],
  "claude-haiku-4-5-20251001": [],
};

/**
 * The effort levels Claude Code takes, as `--effort`, for a model's `effort` setting, e.g.
 * `{ "claude-opus-5-5": [{ effort: { values: CLAUDE_CODE_EFFORTS } }] }`.
 */
export const CLAUDE_CODE_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

/**
 * What `claudeCode` gets: `version` is `@anthropic-ai/claude-code`'s, `command` is
 * `CLAUDE_CODE_COMMAND` by default, and `models` `CLAUDE_CODE_MODELS`. A `provider` must speak
 * Anthropic's Messages API.
 */
export type ClaudeCodeOptions = HelperOptions;

/**
 * The command that runs Claude Code: the prompt and model read from their files, so quotes and
 * newlines reach the agent intact, at the model's `effort` if it has one, its result as JSON,
 * without permission prompts. Given a provider, it points Claude Code at it.
 */
export const CLAUDE_CODE_COMMAND = ({ model, paths, provider }: CommandContext): string =>
  `${provider ? `${envAssignments(providerEnv(provider))} ` : ""}claude -p "$(cat ${paths.prompt})" --model "$(cat ${paths.model})"` +
  `${model.effort === undefined ? "" : ` --effort ${model.effort}`} --output-format json --dangerously-skip-permissions > ${paths.result}`;

/**
 * `baseUrl` as `ANTHROPIC_BASE_URL` takes it: without a final `/v1`, which Claude Code adds
 * itself, as `/v1/messages`. So `OPENROUTER`'s `https://openrouter.ai/api/v1` is
 * `https://openrouter.ai/api`, its Anthropic-compatible address.
 */
const anthropicBaseUrl = (baseUrl: string) => baseUrl.replace(/\/v1\/?$/, "");

/**
 * The variables that point Claude Code at `provider`: its address, and its key as the auth token.
 * `ANTHROPIC_API_KEY` is emptied, so Claude Code doesn't use it in the token's place.
 */
const providerEnv = (provider: CommandProvider) => ({
  ANTHROPIC_BASE_URL: provider.baseUrl,
  ANTHROPIC_AUTH_TOKEN: envRef(provider.apiKeyEnv),
  ANTHROPIC_API_KEY: "",
});

/**
 * A complete harness declaration for Claude Code `version`. Its fragment installs Claude Code as
 * root, writes the model ID and the run script, then switches to the image's non-root `node`
 * user, which a `node` base image has: Claude Code won't skip its permission prompts as root, and
 * nobody is there to answer them. Its reply and token costs are read from its JSON result, and
 * the skills it invoked, for `skillInvoked`, from its session transcripts. It
 * needs `CLAUDE_CODE_OAUTH_TOKEN`, a subscription token from `claude setup-token`, or
 * `ANTHROPIC_API_KEY`: the token if both are set, and only the one, as Claude Code would pick the
 * key if given both.
 *
 * ```ts
 * // harnessModels/claude-code-2.1.311/index.ts
 * export default claudeCode({ version: "2.1.311" });
 * ```
 *
 * Given a `provider`, which must speak Anthropic's Messages API, it needs only the provider's
 * key, and `models` by the provider's IDs. A model's `effort` setting is passed as `--effort`.
 * Anything else, e.g. `MAX_THINKING_TOKENS` or `--max-turns`, is bespoke: write it in `command`.
 *
 * ```ts
 * export default claudeCode({
 *   version: "2.1.311",
 *   provider: OPENROUTER,
 *   models: {
 *     "anthropic/claude-opus-5.5": [{ effort: { values: ["low", "high"] } }, { thinkingTokens: { values: [8000, 32000] } }],
 *   },
 *   command: (ctx) => `MAX_THINKING_TOKENS=${ctx.model.thinkingTokens} ${CLAUDE_CODE_COMMAND(ctx)}`,
 * });
 * ```
 */
export function claudeCode({ version, models = CLAUDE_CODE_MODELS, command = CLAUDE_CODE_COMMAND, provider, requiredEnv }: ClaudeCodeOptions): HarnessDeclaration<undefined, undefined> {
  const commandProvider: CommandProvider | undefined = provider && { baseUrl: anthropicBaseUrl(provider.baseUrl), apiKeyEnv: provider.apiKeyEnv, wireApi: "anthropic" };
  return declareHarness({
    version,
    models,
    applyParameter: (_config, ctx) =>
      [
        `RUN npm install -g @anthropic-ai/claude-code@${ctx.version}`,
        "RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar",
        writeModel(ctx.modelId),
        writeRunScript(command({ modelId: ctx.modelId, model: ctx.model, version: ctx.version, paths: COMMAND_PATHS, provider: commandProvider })),
        "USER node",
      ].join("\n"),
    collectReply: claudeCodeReply,
    collectTokenCosts: claudeCodeTokenCosts,
    collectSkillsInvoked: collectClaudeCodeSkillsInvoked,
    requiredEnv: requiredEnv ?? (provider ? [provider.apiKeyEnv] : [{ oneOf: ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"] }]),
  });
}
