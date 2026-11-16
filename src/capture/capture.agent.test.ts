/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: c5299d71-1f4b-4472-9950-df42605e10cc
 *
 * Humans: add your notes here
 */

// Session capture with a real Claude Code, asked to "say hi" in this repository, whose
// .claude/settings.json wires up the capture hooks. Skipped by `bun test`; run with
// `bun run test:agent`, with `claude` on the PATH and signed in. Costs a fraction of a cent. The
// session's refs are deleted afterwards, and its lines stay in the log.
//
// Every harness, Claude Code included, is also tested from a clean install, in Docker:
// src/cli/commands/capture/capture.docker.test.ts.
import { $ } from "bun";
import { afterAll, describe, expect, test } from "bun:test";
import { REPO_ROOT } from "../testing/scenario.ts";
import { logDir } from "./files.ts";
import { git, REF_PREFIX } from "./git.ts";

const CLI = `${REPO_ROOT}/src/cli/index.ts`;
const PROMPT = "say hi";
const ENABLED = !!Bun.env.THUNDERJAR_AGENT_TESTS;

async function listJson(repo: string) {
  return JSON.parse(await $`bun ${CLI} capture list --json`.cwd(repo).text()) as { session: string; turns: number; prompt: string; start: { agent: { harness: string } } }[];
}

describe.skipIf(!ENABLED || !Bun.which("claude"))("capture, with a real claude -p", () => {
  let session: string | undefined;

  afterAll(() => {
    if (!session) return;
    const refs = git(REPO_ROOT, ["for-each-ref", "--format=%(refname)", `${REF_PREFIX}/${session}/`]).split("\n").filter(Boolean);
    for (const ref of refs) git(REPO_ROOT, ["update-ref", "-d", ref]);
  });

  test("captures the session, lists it, and push --dry-run shows the git command", async () => {
    const result = await $`claude -p --model claude-haiku-5-5 --output-format json ${PROMPT}`.cwd(REPO_ROOT).nothrow().quiet();
    expect(result.exitCode).toBe(0);
    session = JSON.parse(result.stdout.toString()).session_id as string;
    expect(session).toMatch(/^[0-9a-f-]{36}$/);

    const log = await Bun.file(`${logDir(REPO_ROOT)}/capture.log`).text();
    expect(log).toContain(`wrote ${REF_PREFIX}/${session}/start`);
    expect(log).toContain(`wrote ${REF_PREFIX}/${session}/turn-1`);

    const capture = (await listJson(REPO_ROOT)).find((entry) => entry.session === session);
    expect(capture).toMatchObject({ session, turns: 1, prompt: PROMPT, start: { agent: { harness: "claude-code" } } });

    const push = await $`bun ${CLI} capture push --dry-run`.cwd(REPO_ROOT).text();
    expect(push.trim()).toBe("git push --no-verify origin refs/thunderjar/capture/*:refs/thunderjar/capture/*");
  }, 180_000);
});
