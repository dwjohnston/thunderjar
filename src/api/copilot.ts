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
import { jsonLines } from "./jsonLines.ts";

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
