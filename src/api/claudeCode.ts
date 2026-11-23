// Reading what `claude -p --output-format json` writes: one JSON object, with the reply as
// `result`, and the tokens and cost of each model it used as `modelUsage`. For a harness's
// `collectReply` and `collectTokenCosts`, so a Claude Code harness needn't parse it itself, and
// `claudeCode`, a whole Claude Code harness.
//
// `modelUsage` is read, not the flat `usage`: `usage` counts only the top-level agent loop, so it
// leaves out what sub-agents spent. Its keys are camelCase, where `usage`'s are snake_case.
import { declareHarness, type HarnessDeclaration, type HarnessModels, type ModelTokenCosts, type TokenCosts } from "./declarations.ts";
import { writeModel, writeRunScript } from "./files.ts";
import { COMMAND_PATHS, type CommandContext, type CommandProvider, envAssignments, envRef, type Provider } from "./harnessOptions.ts";

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

/** The models `claudeCode` declares unless given others: Anthropic's current IDs, as Claude Code takes them. */
export const CLAUDE_CODE_MODELS: HarnessModels = {
  "claude-fable-5-2": [],
  "claude-opus-5-5": [],
  "claude-sonnet-5-5": [],
  "claude-haiku-5-5": [],
  "claude-haiku-4-5-20251001": [],
};

/** What `claudeCode` gets, with or without a provider. */
type ClaudeCodeCommon = {
  /** The version of `@anthropic-ai/claude-code` to install, e.g. `"2.1.311"`. */
  version: string;
  /** The command its run script runs, from the model, version, paths and provider: `CLAUDE_CODE_COMMAND` by default. */
  command?: (ctx: CommandContext) => string;
};

/** What `claudeCode` gets. */
export type ClaudeCodeOptions = ClaudeCodeCommon &
  (
    | {
        /** Anthropic, Claude Code's own provider. */
        provider?: undefined;
        /** The models it runs, as `declareHarness`'s `models`, e.g. `{ "claude-haiku-5-5": [] }`. By default, `CLAUDE_CODE_MODELS`. */
        models?: HarnessModels;
      }
    | {
        /** Another provider, which must speak Anthropic's Messages API, e.g. `OPENROUTER`. */
        provider: Provider;
        /** The models it runs, by the provider's IDs: required, as the defaults are Anthropic's. */
        models: HarnessModels;
      }
  );

/**
 * The command that runs Claude Code: the prompt and model read from their files, so quotes and
 * newlines reach the agent intact, its result as JSON, without permission prompts.
 */
export const CLAUDE_CODE_COMMAND = ({ paths, provider }: CommandContext): string =>
  `${provider ? `${envAssignments(providerEnv(provider))} ` : ""}claude -p "$(cat ${paths.prompt})" --model "$(cat ${paths.model})" --output-format json --dangerously-skip-permissions > ${paths.result}`;

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
 * nobody is there to answer them. Its reply and token costs are read from its JSON result. It
 * needs `CLAUDE_CODE_OAUTH_TOKEN`, a subscription token from `claude setup-token`, or
 * `ANTHROPIC_API_KEY`: the token if both are set, and only the one, as Claude Code would pick the
 * key if given both.
 *
 * ```ts
 * // harnessModels/claude-code-2.1.311/index.ts
 * export default claudeCode({ version: "2.1.311" });
 * ```
 */
export function claudeCode({ version, models = CLAUDE_CODE_MODELS, command = CLAUDE_CODE_COMMAND, provider }: ClaudeCodeOptions): HarnessDeclaration<undefined, undefined> {
  const commandProvider: CommandProvider | undefined = provider && { ...provider, wireApi: "anthropic" };
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
    requiredEnv: provider ? [provider.apiKeyEnv] : [{ oneOf: ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"] }],
  });
}
