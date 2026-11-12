/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: c07c882c-639c-493c-8957-caa40aa841ac
 * Supervising engineer: blacksheep-bot
 *
 *
 * Humans: add your notes here
 *
 *
 */

// What an agent left behind, trimmed for the log: the end of each turn's standard error and result
// file. The end, since that's where an agent's error usually is, e.g. opencode's last JSON event.

/** How much of each turn's standard error the log keeps. */
export const STDERR_LIMIT = 4000;
/** How much of each turn's result file the log keeps. */
export const RESULT_LIMIT = 2000;

/** `text` if it's at most `limit` characters, otherwise its last `limit`, after a note of how many were cut. */
export function tail(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `[${text.length - limit} characters cut]…${text.slice(-limit)}`;
}

/** `text` if it's at most `limit` characters, otherwise its first `limit`, before a note of how many were cut. */
export function head(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}…[${text.length - limit} characters cut]`;
}

/** One turn's output, as logged. A field is left out if the turn left nothing there. */
export type TurnOutput = { turn: number; stderr?: string; result?: string };

/**
 * Each turn's standard error and result file, from `stderrs` and `harnessResults` in turn order,
 * trimmed to their ends. Turns counted from 1; one that left neither is left out.
 */
export function agentOutput(harnessResults: (string | null)[], stderrs: (string | null)[]): TurnOutput[] {
  return harnessResults.flatMap((result, i) => {
    const stderr = stderrs[i]?.trim();
    const trimmed = result?.trim();
    if (!stderr && !trimmed) return [];
    return [{ turn: i + 1, ...(stderr && { stderr: tail(stderr, STDERR_LIMIT) }), ...(trimmed && { result: tail(trimmed, RESULT_LIMIT) }) }];
  });
}
