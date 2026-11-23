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
 * committed or not, then the whole of each new test file it left untracked. A test file is any
 * named `*.test.*`, at any depth. Each `+++ ` line is a diff's file header, not an added line.
 */
export const ADDED_TEST_LINES =
  "git diff --no-renames --no-color -U0 refs/thunderjar/start -- '*.test.*' | sed -n '/^+++ /d; s/^+//p'" +
  " && git ls-files --others --exclude-standard -z -- '*.test.*' | xargs -0 -r cat";

/** The `baseUrl` of each provider declared in `text`, other than OpenRouter's. */
export function customProviderUrls(text: string): string[] {
  return [...text.matchAll(/\bbaseUrl\s*:\s*["'`]([^"'`]+)["'`]/g)].map((match) => match[1]!).filter((url) => !/openrouter\.ai/i.test(url));
}

/** What the `shell` instrument gives for `ADDED_TEST_LINES`. */
export type Shell = { exitCode: number; stdout: string };

/** Whether the added test lines declare a custom provider: one with a baseUrl of its own, not OPENROUTER's. */
export const customProviderTest = (v: Shell) => (v.exitCode === 0 ? customProviderUrls(v.stdout).length > 0 : undefined);

/** Whether a custom provider they declare is DeepSeek. Doesn't apply when they declare none. */
export function deepSeekProvider(v: Shell): boolean | undefined {
  const urls = v.exitCode === 0 ? customProviderUrls(v.stdout) : [];
  return urls.length === 0 ? undefined : urls.some((url) => /deepseek/i.test(url));
}
