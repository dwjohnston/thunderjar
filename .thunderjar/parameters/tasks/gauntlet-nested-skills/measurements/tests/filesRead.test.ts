/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLhzk1BgPsDT4k7aD6J
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { expect, test } from "bun:test";
import { measure } from "thunderjar/testing";
import filesRead from "../filesRead.ts";
import toolsUsed from "../toolsUsed.ts";

test("a run that read a.ts with a read tool, and a's SKILL.md with cat, read both", async () => {
  const toolCalls = [
    { tool: "Read", kind: "read" as const, paths: ["a/a.ts"] },
    { tool: "Bash", kind: "shell" as const, paths: [], command: "cat a/.agents/skills/a/SKILL.md" },
  ];
  expect((await measure(filesRead, { toolCalls })).metrics).toEqual({ readATs: true, readSkillA: true });
  expect((await measure(toolsUsed, { toolCalls })).metrics).toEqual({ shellCalls: 1, readCalls: 1, searchCalls: 0 });
});

test("a run that only listed the files read neither", async () => {
  const toolCalls = [{ tool: "Bash", kind: "shell" as const, paths: [], command: "ls -R a" }];
  expect((await measure(filesRead, { toolCalls })).metrics).toEqual({ readATs: false, readSkillA: false });
});
