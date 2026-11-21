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
import { type Instrument, checkPattern, checkString } from "../instrument.ts";

/**
 * How many times the agent, or a sub-agent it started, called `tool`, read from its harness's
 * transcript.
 */
export const toolCalled: Instrument<{ tool: string; inputMatches?: string }, number> = {
  version: 1,
  defaultScore: { kind: "boolean", score: () => false },
  async evaluate({ tool, inputMatches }, ctx) {
    const transcript = await ctx.transcript();
    if (transcript.outcome !== "collected") return { outcome: "skipped", reason: `no transcript: ${transcript.reason}` };
    const pattern = inputMatches === undefined ? undefined : new RegExp(inputMatches);
    const calls = transcript.events.filter(
      (event) => event.kind === "toolCall" && event.tool === tool && (pattern === undefined || pattern.test(JSON.stringify(event.input) ?? "")),
    );
    return { outcome: "measured", data: calls.length };
  },
  checkConfig(config) {
    const { tool, inputMatches } = (config ?? {}) as { tool?: unknown; inputMatches?: unknown };
    return [
      ...checkString("config.tool", tool, `the harness's name for a tool, e.g. "Bash"`),
      ...(inputMatches === undefined ? [] : checkPattern(inputMatches, "config.inputMatches")),
    ];
  },
};
