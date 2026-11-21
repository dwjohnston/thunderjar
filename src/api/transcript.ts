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
// What the harnesses' transcript parsers share: reading JSON lines, and putting the events of a
// session's files, e.g. the main agent's and each sub-agent's, back in the order they happened.
import type { TranscriptEvent } from "./declarations.ts";

/** Each line of `text` that is a JSON object, parsed. Any other line, e.g. one cut short as the agent was killed, is skipped. */
export function jsonLines(text: string): Record<string, unknown>[] {
  return text.split("\n").flatMap((line) => {
    try {
      const parsed: unknown = JSON.parse(line);
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? [parsed as Record<string, unknown>] : [];
    } catch {
      return [];
    }
  });
}

/** An event, and when it happened, in milliseconds since the epoch. */
export type TimedEvent = { at: number; event: TranscriptEvent };

/**
 * The events of each file, in the order they happened: by time, and, at the same time, as they
 * were in their files. One whose time isn't a number happened when the one before it in its file did.
 */
export function inSessionOrder(files: TimedEvent[][]): TranscriptEvent[] {
  const timed = files.flatMap((events) => {
    let previous = 0;
    return events.map(({ at, event }) => ({ at: (previous = Number.isFinite(at) ? at : previous), event }));
  });
  return timed.toSorted((a, b) => a.at - b.at).map(({ event }) => event);
}
