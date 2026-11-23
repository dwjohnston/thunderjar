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
import type { TokenCosts } from "./declarations.ts";
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
 * provider charged.
 */
export function opencodeTokenCosts(raw: string, modelId: string): TokenCosts {
  let inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheCreationTokens = 0, costUsd = 0;
  for (const { type, part } of jsonLines<Event>(raw)) {
    if (type !== "step_finish") continue;
    const t = part?.tokens;
    inputTokens += tokenCount(t?.input) ?? 0;
    outputTokens += (tokenCount(t?.output) ?? 0) + (tokenCount(t?.reasoning) ?? 0);
    cacheReadTokens += tokenCount(t?.cache?.read) ?? 0;
    cacheCreationTokens += tokenCount(t?.cache?.write) ?? 0;
    costUsd += tokenCount(part?.cost) ?? 0;
  }
  // A model missing from OpenCode's price table costs 0 there, so 0 means "unknown", not free.
  const cost = costUsd > 0 ? { costUsd, costBasis: "list" as const } : {};
  return { outcome: "collected", models: [{ model: modelId, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, ...cost }] };
}
