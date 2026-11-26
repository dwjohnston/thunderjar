/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLhzk1BgPsDT4k7aD6J
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */
import { type Instrument, show } from "../instrument.ts";

/**
 * How many tool calls the agent made of each of `tools`, as its harness's `collectToolCalls` read
 * them: `{ [tool]: count }`. Each is a kind, e.g. `shell`, or a harness's own tool name, e.g.
 * `Read`, and counts the calls with that kind or that name. `skipped`, saying why, when the tool
 * calls can't be read.
 */
export const toolCalled: Instrument<{ tools: string[] }, Record<string, number>> = {
  version: 1,
  async evaluate({ tools }, ctx) {
    const read = await ctx.toolCalls();
    if (read.outcome !== "collected") return { outcome: "skipped", reason: `no tool calls to read: ${read.reason}` };
    return { outcome: "measured", data: Object.fromEntries(tools.map((tool) => [tool, read.calls.filter((call) => call.kind === tool || call.tool === tool).length])) };
  },
  checkConfig(config) {
    const { tools } = (config ?? {}) as { tools?: unknown };
    const ok = Array.isArray(tools) && tools.length > 0 && tools.every((tool) => typeof tool === "string" && tool !== "");
    return ok ? [] : [["config.tools", `must be a list of tool kinds or names, at least one, got ${show(tools)}`]];
  },
};
