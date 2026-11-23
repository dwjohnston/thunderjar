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
import type { ModelTokenCosts, TokenCosts } from "./declarations.ts";
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
 * is a premium-request multiplier, not dollars, so no cost is reported.
 */
export function copilotTokenCosts(raw: string): TokenCosts {
  const usage = jsonLines<Event>(raw).findLast((e) => e.type === COPILOT_USAGE_TYPE)?.data;
  const metrics = (usage?.modelMetrics ?? {}) as Record<string, { usage?: Record<string, unknown> }>;
  const models: ModelTokenCosts[] = Object.entries(metrics).map(([model, metric]) => {
    const [input, output, cacheRead, cacheWrite] = ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens"].map((k) => tokenCount(metric.usage?.[k]) ?? 0) as [number, number, number, number];
    return { model, inputTokens: Math.max(0, input - cacheRead - cacheWrite), outputTokens: output, cacheReadTokens: cacheRead, cacheCreationTokens: cacheWrite };
  });
  const apiDurationMs = tokenCount(usage?.totalApiDurationMs);
  return { outcome: "collected", models, ...(apiDurationMs !== undefined && { apiDurationMs }) };
}
