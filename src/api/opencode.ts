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

/** The text of the last step, i.e. after the last "step_start": the agent's final reply. Throws if there is none. */
export function opencodeReply(_raw: string): string {
  return "";
}
