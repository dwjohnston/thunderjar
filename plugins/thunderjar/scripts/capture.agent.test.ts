/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: c5299d71-1f4b-4472-9950-df42605e10cc
 *
 * Humans: add your notes here
 */

// Session capture with a real Claude Code: `claude -p` on Haiku 5.5, in a throwaway repository whose
// hooks are these scripts. Skipped by `bun test`; run with `bun run test:agent`, which needs `claude`
// on the PATH and signed in. Costs a fraction of a cent.
import { $ } from "bun";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { logDir } from "./lib.ts";

const SCRIPTS = import.meta.dir;
const PROMPT = "say hi";

describe.skipIf(!Bun.env.THUNDERJAR_AGENT_TESTS)("capture, with a real claude -p", () => {
  let repo: string;

  beforeAll(async () => {
    repo = mkdtempSync(`${tmpdir()}/tj-capture-`);
    await $`git init -q -b main && git commit -q --allow-empty -m init`.cwd(repo).env({ ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" });
    mkdirSync(`${repo}/.claude`);
    const hook = (script: string, timeout: number) => [{ hooks: [{ type: "command", command: `bun "${SCRIPTS}/${script}"`, timeout }] }];
    writeFileSync(
      `${repo}/.claude/settings.json`,
      JSON.stringify({ hooks: { UserPromptSubmit: hook("start.ts", 60), Stop: hook("stop.ts", 120) } }, null, 2),
    );
  });

  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  test("captures the session, lists it, and push --dry-run shows the git command", async () => {
    const result = await $`claude -p --model claude-haiku-5-5 --output-format json ${PROMPT}`
      .cwd(repo)
      .env({ ...process.env, THUNDERJAR_CAPTURE: "1" })
      .nothrow()
      .quiet();
    expect(result.exitCode).toBe(0);
    const session: string = JSON.parse(result.stdout.toString()).session_id;
    expect(session).toMatch(/^[0-9a-f-]{36}$/);

    const log = readFileSync(`${logDir(repo)}/capture.log`, "utf8");
    expect(log).toContain(`wrote refs/thunderjar/capture/${session}/start`);
    expect(log).toContain(`wrote refs/thunderjar/capture/${session}/turn-1`);

    const list = JSON.parse(await $`bun ${SCRIPTS}/list.ts --json`.cwd(repo).text());
    const capture = list.find((entry: { session: string }) => entry.session === session);
    expect(capture).toMatchObject({ session, turns: 1, prompt: PROMPT });

    const push = await $`bun ${SCRIPTS}/push.ts --dry-run`.cwd(repo).text();
    expect(push.trim()).toBe("git push --no-verify origin refs/thunderjar/capture/*:refs/thunderjar/capture/*");
  }, 180_000);
});
