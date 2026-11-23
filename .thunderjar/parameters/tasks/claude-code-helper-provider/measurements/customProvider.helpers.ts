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
 * committed or not.
 */
export const ADDED_TEST_LINES = "true";

/** The `baseUrl` of each provider declared in `text`, other than OpenRouter's. */
export function customProviderUrls(text: string): string[] {
  return [...text.matchAll(/\bbaseUrl\s*:\s*["'`]([^"'`]+)["'`]/g)].map((match) => match[1]!);
}
