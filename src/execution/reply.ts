// The agent's final reply: read from the text of its result file by its harness's `collectReply`.
import type { HarnessDeclaration, Reply } from "../api/declarations.ts";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The reply `collectReply` reads from `harnessResult`, the text of the result file, or why there's none. */
export function collectReply(collect: HarnessDeclaration["collectReply"], harnessResult: string | null): Reply {
  if (harnessResult === null) return { outcome: "unavailable", reason: "the agent left no result file" };
  if (!collect) return { outcome: "unavailable", reason: "its harness has no collectReply" };
  let text: unknown;
  try {
    text = collect(harnessResult);
  } catch (error) {
    return { outcome: "unavailable", reason: `collectReply threw: ${message(error)}` };
  }
  if (typeof text !== "string") return { outcome: "unavailable", reason: `collectReply returned ${typeof text}, not a string` };
  return { outcome: "collected", text };
}
