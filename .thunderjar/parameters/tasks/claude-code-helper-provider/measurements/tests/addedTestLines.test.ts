/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { $ } from "bun";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { ADDED_TEST_LINES } from "../customProvider.helpers.ts";

// A workspace like a run's: a git repository with its start at refs/thunderjar/start.
let dir: string;
const git = (...args: string[]) => $`git -c user.name=test -c user.email=test@example.invalid ${args}`.cwd(dir).quiet();
const write = (path: string, text: string) => Bun.write(`${dir}/${path}`, text);
const added = async () => (await $`sh -c ${ADDED_TEST_LINES}`.cwd(dir).quiet()).stdout.toString();

beforeEach(async () => {
  dir = `${Bun.env.TMPDIR || "/tmp"}/added-test-lines-${crypto.randomUUID()}`;
  await $`mkdir -p ${dir}`.quiet();
  await git("init", "--quiet");
  await write("src/api/claudeCode.test.ts", 'const REAL = "claudeCode.deepseek.result.json";\n');
  await write("src/api/claudeCode.ts", "export {};\n");
  await git("add", "-A");
  await git("commit", "--quiet", "-m", "start");
  await git("update-ref", "refs/thunderjar/start", "HEAD");
});

afterEach(async () => {
  await $`rm -rf ${dir}`.quiet();
});

test("prints the lines committed to test files since the start, not those already there or in other files", async () => {
  await write("src/api/claudeCode.test.ts", 'const REAL = "claudeCode.deepseek.result.json";\nconst url = "https://mycustomprovider.com";\n');
  await write("src/api/claudeCode.ts", 'export const url = "https://elsewhere.example";\n');
  await git("commit", "--quiet", "-am", "change");

  expect(await added()).toBe('const url = "https://mycustomprovider.com";\n');
});
