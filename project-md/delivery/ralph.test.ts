/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: session_01LCLeLjFb1Gy2NHaFDTB6tk
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */
import { expect, test } from "bun:test";
import { parseTask } from "./ralph.ts";

test("parseTask reads harness, model and effort from the frontmatter", () => {
  const text = "---\nharness: claude-code\nmodel: sonnet\neffort: medium\n---\n\n# 3900: A task\n";
  expect(parseTask("3900_a-task", "tasks/3900_a-task.md", text)).toEqual({
    name: "3900_a-task",
    path: "tasks/3900_a-task.md",
    harness: "claude-code",
    model: "sonnet",
    effort: "medium",
    text,
  });
});
