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
// Reading what `copilot --output-format json` writes: JSON lines, one event each, and the usage
// line the run script appends. For a harness's `collectReply` and `collectTokenCosts`, so a
// Copilot harness needn't parse it itself, and `copilot`, a whole Copilot harness.
//
// Copilot's JSON lines leave out its token events, so the run script also has it write its usage
// statistics to a file, and appends them to the result file as one more line:
// {"type":"thunderjar.usage","data":<the usage file>}.
import { declareHarness, type HarnessDeclaration, type HarnessModels, type ModelTokenCosts, type TokenCosts } from "./declarations.ts";
import type { HelperOptions } from "./harnessOptions.ts";
import { jsonLines, tokenCount } from "./jsonLines.ts";

type Event = { type?: unknown; agentId?: unknown; data?: Record<string, unknown> };

/** The main agent's last message with text: its final reply. Sub-agents' messages have an agentId. Throws if there is none. */
export function copilotReply(raw: string): string {
  const reply = jsonLines<Event>(raw)
    .filter((e) => e.type === "assistant.message" && e.agentId === undefined)
    .map((e) => e.data?.content)
    .findLast((content) => typeof content === "string" && content.trim() !== "");
  if (typeof reply !== "string") throw new Error("no assistant.message with content in Copilot's JSONL output");
  return reply;
}

/** The type of the line the run script appends to the result, holding Copilot's usage statistics. */
export const COPILOT_USAGE_TYPE = "thunderjar.usage";

/**
 * Tokens per model, from the usage line the run script appended. Copilot's `inputTokens` include
 * cached reads and writes, so they're subtracted to fit Thunderjar's separate buckets. Its `cost`
 * is a premium-request multiplier, not dollars, so no cost is reported. `unparseable` without a
 * readable usage line, e.g. when the command wasn't given `--usage-output-file`, and
 * `notReported` if it counts no tokens.
 */
export function copilotTokenCosts(raw: string): TokenCosts {
  const usage = jsonLines<Event>(raw).findLast((e) => e.type === COPILOT_USAGE_TYPE)?.data;
  const metrics = usage?.modelMetrics;
  if (typeof metrics !== "object" || metrics === null) return { outcome: "unavailable", reason: "unparseable" };
  const models: ModelTokenCosts[] = [];
  for (const [model, metric] of Object.entries(metrics as Record<string, { usage?: Record<string, unknown> }>)) {
    const counts = ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens"].map((k) => tokenCount(metric.usage?.[k]));
    if (counts.some((n) => n === undefined)) return { outcome: "unavailable", reason: "unparseable" };
    const [input, output, cacheRead, cacheWrite] = counts as [number, number, number, number];
    models.push({ model, inputTokens: Math.max(0, input - cacheRead - cacheWrite), outputTokens: output, cacheReadTokens: cacheRead, cacheCreationTokens: cacheWrite });
  }
  const total = models.reduce((sum, m) => sum + m.inputTokens + m.outputTokens + m.cacheCreationTokens + m.cacheReadTokens, 0);
  if (total === 0) return { outcome: "unavailable", reason: "notReported" };
  const apiDurationMs = tokenCount(usage?.totalApiDurationMs);
  return { outcome: "collected", models, ...(apiDurationMs !== undefined && { apiDurationMs }) };
}

/** The models `copilot` declares unless given others, as Copilot takes them. Which you can use depends on your Copilot plan. */
export const COPILOT_MODELS: HarnessModels = {
  "claude-haiku-5.5": [],
  "gpt-5.5": [],
};

/** What `copilot` gets. */
export type CopilotOptions = HelperOptions;

/** A complete harness declaration for Copilot `version`. */
export function copilot({ version, models = COPILOT_MODELS }: CopilotOptions): HarnessDeclaration<undefined, undefined> {
  return declareHarness({
    version,
    models,
    applyParameter: () => "",
    collectReply: copilotReply,
    collectTokenCosts: copilotTokenCosts,
    requiredEnv: ["COPILOT_GITHUB_TOKEN"],
  });
}
