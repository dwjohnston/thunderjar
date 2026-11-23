/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// Helpers for customProvider.ts: the test lines the agent added, and the providers they declare.

/**
 * A shell command that prints every line the agent added to a test file since the start,
 * committed or not. A test file is any named `*.test.*`, at any depth. Each `+++ ` line is a diff's
 * file header, not an added line.
 */
export const ADDED_TEST_LINES = "git diff --no-renames --no-color -U0 refs/thunderjar/start -- '*.test.*' | sed -n '/^+++ /d; s/^+//p'";

/** The `baseUrl` of each provider declared in `text`, other than OpenRouter's. */
export function customProviderUrls(text: string): string[] {
  return [...text.matchAll(/\bbaseUrl\s*:\s*["'`]([^"'`]+)["'`]/g)].map((match) => match[1]!).filter((url) => !/openrouter\.ai/i.test(url));
}
