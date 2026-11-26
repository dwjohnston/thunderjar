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
// Turning a harness's own tool calls into Thunderjar's `ToolCall`s: each keeps the harness's name
// for its tool, and gets a kind from a vocabulary every harness shares, so a measurement can ask
// "how many shell commands" of any harness, or "how many `view` calls" of Copilot alone.
import type { ToolCall, ToolKind } from "./declarations.ts";

/** Every kind of tool call, as `ToolKind` lists them. */
export const TOOL_KINDS = ["read", "edit", "search", "shell", "web", "skill", "subagent", "other"] as const satisfies readonly ToolKind[];

/**
 * What a harness's tool is: its kind, and the keys of its input that hold its paths, its shell
 * command and the folder it ran in, or a patch whose `*** Update File:` lines name the files it changes.
 */
export type ToolShape = { kind: ToolKind; paths?: readonly string[]; command?: string; cwd?: string; patch?: string };

/** A patch's files, from its `*** Add File:`, `*** Update File:`, `*** Delete File:` and `*** Move to:` lines. */
export const patchPaths = (patch: string): string[] => [...patch.matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm)].map((m) => (m[1] as string).trim());

/** The call of `tool` with `input`, as `shapes`, a harness's tools by name, says to read it. A tool not in `shapes` is `other`. */
export function toolCallOf(tool: string, input: unknown, shapes: Record<string, ToolShape>): ToolCall {
  const shape: ToolShape = Object.hasOwn(shapes, tool) ? (shapes[tool] as ToolShape) : { kind: "other" };
  const args = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const text = (key: string | undefined) => (key !== undefined && typeof args[key] === "string" && args[key] !== "" ? (args[key] as string) : undefined);
  const paths = (shape.paths ?? []).flatMap((key) => text(key) ?? []);
  const patch = text(shape.patch);
  const command = text(shape.command);
  const cwd = text(shape.cwd);
  return { tool, kind: shape.kind, paths: patch === undefined ? paths : [...paths, ...patchPaths(patch)], ...(command !== undefined && { command }), ...(cwd !== undefined && { cwd }) };
}
