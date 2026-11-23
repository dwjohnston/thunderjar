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
// `collectReply` and `collectTokenCosts`, so a Codex harness needn't parse it itself, and `codex`,
// a whole Codex harness.

import type { TokenCosts } from "./declarations.ts";
import { jsonLines, tokenCount } from "./jsonLines.ts";

type Event = { type?: unknown; item?: { type?: unknown; item_type?: unknown; text?: unknown }; usage?: Record<string, unknown> };

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
 * model. Its `input_tokens` include the cached ones, so they're subtracted.
 */
export function codexTokenCosts(raw: string, modelId: string): TokenCosts {
  let input = 0, cached = 0, output = 0;
  for (const { type, usage } of jsonLines<Event>(raw)) {
    if (type !== "turn.completed" || !usage) continue;
    input += tokenCount(usage.input_tokens) ?? 0;
    cached += tokenCount(usage.cached_input_tokens) ?? 0;
    output += tokenCount(usage.output_tokens) ?? 0;
  }
  return {
    outcome: "collected",
    models: [{ model: modelId, inputTokens: Math.max(0, input - cached), outputTokens: output, cacheReadTokens: cached, cacheCreationTokens: 0 }],
  };
}
