// Reading what `claude -p --output-format json` writes: one JSON object, with the reply as
// `result`, and the tokens and cost of each model it used as `modelUsage`. For a harness's
// `collectReply` and `collectTokenCosts`, so a Claude Code harness needn't parse it itself, and
// `claudeCode`, a whole Claude Code harness.
//
// `modelUsage` is read, not the flat `usage`: `usage` counts only the top-level agent loop, so it
// leaves out what sub-agents spent. Its keys are camelCase, where `usage`'s are snake_case.
import { declareHarness, type HarnessCliCtx, type HarnessDeclaration, type ModelTokenCosts, type TokenCosts } from "./declarations.ts";

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

/** What `claudeCode` gets. */
export type ClaudeCodeOptions = {
  /** The version of `@anthropic-ai/claude-code` to install, e.g. `"2.1.311"`. */
  version: string;
  /** Replaces the command that runs Claude Code for each turn: `claudeCodeCli` is the default. */
  cli?: HarnessDeclaration<undefined, undefined>["cli"];
};

/**
 * The command that runs Claude Code for one turn: the prompt read from its file, so quotes and
 * newlines reach the agent intact, its result as JSON, without permission prompts, starting the
 * session on turn 0 and resuming it after.
 */
export const claudeCodeCli = (ctx: HarnessCliCtx): string =>
  `claude -p "$(cat ${ctx.promptPath})" --model ${ctx.modelId} --output-format json --dangerously-skip-permissions` +
  ` ${ctx.turn === 0 ? "--session-id" : "--resume"} ${ctx.sessionId} > ${ctx.resultPath}`;

/**
 * A complete harness declaration for Claude Code `version`. It installs Claude Code as root, then
 * runs it as the image's non-root `node` user, which a `node` base image has: Claude Code won't
 * skip its permission prompts as root, and nobody is there to answer them. Its reply and token
 * costs are read from its JSON result, and it needs `ANTHROPIC_API_KEY`.
 *
 * ```ts
 * // harnessModels/claude-code-2.1.311/index.ts
 * export default claudeCode({ version: "2.1.311" });
 * ```
 */
export function claudeCode({ version, cli = claudeCodeCli }: ClaudeCodeOptions): HarnessDeclaration<undefined, undefined> {
  return declareHarness({
    version,
    applyParameter: (_config, ctx) => `RUN npm install -g @anthropic-ai/claude-code@${ctx.version}
RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar
USER node`,
    cli,
    collectReply: claudeCodeReply,
    collectTokenCosts: claudeCodeTokenCosts,
    requiredEnv: ["ANTHROPIC_API_KEY"],
  });
}
