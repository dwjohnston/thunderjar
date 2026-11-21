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
import type { Instrument } from "../instrument.ts";

/**
 * How many times the agent, or a sub-agent it started, called `tool`, read from its harness's
 * transcript.
 */
export const toolCalled: Instrument<{ tool: string; inputMatches?: string }, number> = {
  version: 1,
  defaultScore: { kind: "boolean", score: () => false },
  async evaluate({ tool }, ctx) {
    const transcript = await ctx.transcript();
    if (transcript.outcome !== "collected") return { outcome: "measured", data: 0 };
    return { outcome: "measured", data: transcript.events.filter((event) => event.kind === "toolCall" && event.tool === tool).length };
  },
  checkConfig() {
    return [];
  },
};
