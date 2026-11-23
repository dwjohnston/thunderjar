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
// Reading a result file of JSON lines, one event each, as Codex, Copilot and OpenCode write them.

/** Each line of `raw` that is a JSON object. Other lines, e.g. a warning an agent printed, are skipped. */
export function jsonLines<T extends object>(raw: string): T[] {
  return raw.split("\n").flatMap((line) => {
    try {
      const parsed: unknown = JSON.parse(line);
      return typeof parsed === "object" && parsed !== null ? [parsed as T] : [];
    } catch {
      return [];
    }
  });
}

/** `value` if it's a count of tokens: a finite number, not negative. */
export const tokenCount = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
