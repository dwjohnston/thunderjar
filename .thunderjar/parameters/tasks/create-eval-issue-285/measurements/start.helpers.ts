/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiFLaxJLiUMbmTp2fu
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// What .thunderjar/ held at the start, 242388c8, so the measurements count only what the agent
// added: jsAst reads the end state, not a diff. Update both lists if you move the code state.

/** The task folders in .thunderjar/parameters/tasks/ at the start. */
export const START_TASKS = [
  "add-claude-code-harness-0201",
  "gauntlet-nested-skills",
  "gauntlet-wrong-failing-test",
  "humans-md",
  "is-prime",
  "rename-nonexistent-harness-version-to-999",
  "security-assessment",
  "tj-eval-blacksheepcode",
];

/** Whether `file`, a workspace path, is in a task folder that was there at the start. */
export const inStartTask = (file: string) => START_TASKS.some((task) => file.startsWith(`.thunderjar/parameters/tasks/${task}/`));
