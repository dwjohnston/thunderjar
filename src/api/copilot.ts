/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: session_01LCLeLgjaf4n2FVk7rLLHNR
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */
// Reading what GitHub Copilot CLI keeps of a session, for a Copilot harness's `transcript`.
import type { TranscriptDeclaration } from "./declarations.ts";
import { type TimedEvent, inSessionOrder, jsonLines } from "./transcript.ts";

/**
 * Copilot's transcript: the events it keeps of each session, as JSON lines, in
 * `~/.copilot/session-state/<session ID>/events.jsonl`, a sub-agent's among them.
 */
export const copilotTranscript: TranscriptDeclaration = {
  files: ["~/.copilot/session-state/*/events.jsonl"],
  parse: (files) => inSessionOrder(files.map(({ text }) => jsonLines(text).flatMap(copilotEvents))),
};

type Data = { content?: unknown; toolRequests?: unknown };
type ToolRequest = { name?: unknown; arguments?: unknown };

/**
 * The events of one line of Copilot's events: a `user.message`, or an `assistant.message`, its
 * text, then the tools it asked to run. A sub-agent's events have an `agentId`.
 */
function copilotEvents(line: Record<string, unknown>): TimedEvent[] {
  const data = (line.data ?? {}) as Data;
  const agent = line.agentId === undefined ? "main" : "subagent";
  const at = typeof line.timestamp === "string" ? Date.parse(line.timestamp) : Number.NaN;
  const message = (role: "user" | "assistant"): TimedEvent[] =>
    typeof data.content === "string" && data.content !== "" ? [{ at, event: { kind: "message", role, text: data.content, agent } }] : [];
  if (line.type === "user.message") return message("user");
  if (line.type !== "assistant.message") return [];
  const requests = (Array.isArray(data.toolRequests) ? data.toolRequests : []) as ToolRequest[];
  return [
    ...message("assistant"),
    ...requests.flatMap((request): TimedEvent[] =>
      typeof request.name === "string" ? [{ at, event: { kind: "toolCall", tool: request.name, input: request.arguments, agent } }] : [],
    ),
  ];
}
