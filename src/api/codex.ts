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
// Reading what Codex CLI keeps of a session, for a Codex harness's `transcript`.
import type { TranscriptDeclaration } from "./declarations.ts";
import { type TimedEvent, inSessionOrder, jsonLines } from "./transcript.ts";

/**
 * Codex's transcript: the rollout it keeps of each thread, as JSON lines, in
 * `~/.codex/sessions/<year>/<month>/<day>/rollout-<time>-<thread ID>.jsonl`. A sub-agent it starts
 * is a thread of its own, with a rollout of its own.
 */
export const codexTranscript: TranscriptDeclaration = {
  files: ["~/.codex/sessions/**/rollout-*.jsonl"],
  parse: (files) => inSessionOrder(files.map(({ text }) => codexEvents(jsonLines(text)))),
};

type Payload = { type?: unknown; thread_source?: unknown; item?: { type?: unknown; content?: unknown }; name?: unknown; arguments?: unknown; input?: unknown };

/** Its text: the text of each of its parts, joined. */
const textOf = (content: unknown) =>
  Array.isArray(content) ? content.map((part: { text?: unknown }) => (typeof part.text === "string" ? part.text : "")).join("") : "";

/** `raw`, a tool call's arguments as JSON, parsed, or as it is if it isn't JSON. */
function parsed(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * The events of one rollout: its messages are its completed `UserMessage` and `AgentMessage` items,
 * not the instructions and context Codex sends the model as messages too; its tool calls, its
 * `function_call` and `custom_tool_call` responses. A sub-agent's rollout starts with a
 * `session_meta` whose `thread_source` is `subagent`.
 */
function codexEvents(lines: Record<string, unknown>[]): TimedEvent[] {
  const meta = lines.find((line) => line.type === "session_meta")?.payload as Payload | undefined;
  const agent = meta?.thread_source === "subagent" ? "subagent" : "main";
  return lines.flatMap((line): TimedEvent[] => {
    const payload = (line.payload ?? {}) as Payload;
    const at = typeof line.timestamp === "string" ? Date.parse(line.timestamp) : Number.NaN;
    if (line.type === "event_msg" && payload.type === "item_completed") {
      const role = payload.item?.type === "UserMessage" ? "user" : payload.item?.type === "AgentMessage" ? "assistant" : undefined;
      const text = textOf(payload.item?.content);
      return role === undefined || text === "" ? [] : [{ at, event: { kind: "message", role, text, agent } }];
    }
    if (line.type === "response_item" && (payload.type === "function_call" || payload.type === "custom_tool_call") && typeof payload.name === "string") {
      const input = payload.type === "function_call" ? parsed(payload.arguments) : payload.input;
      return [{ at, event: { kind: "toolCall", tool: payload.name, input, agent } }];
    }
    return [];
  });
}
