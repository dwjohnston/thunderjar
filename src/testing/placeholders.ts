/** Absolute paths to replace, keyed by their placeholder, e.g. `{ "<PROJECT>": "/repo/fixtures/…/project" }`. */
export type PathPlaceholders = Record<string, string>;

// Crockford base32, and a ULID's first character is at most 7.
const ULID = /\b[0-7][0-9A-HJKMNP-TV-Z]{25}\b/gi;
const DURATION = /\b\d+(?:\.\d+)?(?:ms|s)\b/g;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * `text` with what changes between runs replaced:
 *
 * - each path in `paths` with its placeholder, longest path first
 * - ULIDs with `<ULID>`
 * - durations such as `123ms` or `1.2s` with `<duration>`
 */
export function applyPlaceholders(text: string, paths: PathPlaceholders = {}): string {
  const byLength = Object.entries(paths)
    .filter(([, path]) => path !== "")
    .toSorted(([, a], [, b]) => b.length - a.length);
  let result = text;
  for (const [placeholder, path] of byLength) {
    const trimmed = path.replace(/\/+$/, "") || path;
    result = result.replace(new RegExp(escapeRegex(trimmed), "g"), placeholder);
  }
  return result.replace(ULID, "<ULID>").replace(DURATION, "<duration>");
}
