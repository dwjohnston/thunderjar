/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: c5299d71-1f4b-4472-9950-df42605e10cc
 *
 * Humans: add your notes here
 */

// Session capture with a real Claude Code: `claude -p` on Haiku 5.5, run in this repository, whose
// .claude/settings.json wires up the capture hooks. Skipped by `bun test`; run with `bun run test:agent`,
// which needs `claude` on the PATH and signed in. Costs a fraction of a cent. The session's refs are
// deleted afterwards; its lines stay in the log.
import { $ } from "bun";
import { afterAll, describe, expect, test } from "bun:test";
import { git, logDir, REF_PREFIX } from "./lib.ts";

const SCRIPTS = import.meta.dir;
const REPO = git(SCRIPTS, ["rev-parse", "--show-toplevel"]).trim();
const PROMPT = "say hi";

describe.skipIf(!Bun.env.THUNDERJAR_AGENT_TESTS)("capture, with a real claude -p", () => {
  let session: string | undefined;

  afterAll(() => {
    if (!session) return;
    const refs = git(REPO, ["for-each-ref", "--format=%(refname)", `${REF_PREFIX}/${session}/`]).split("\n").filter(Boolean);
    for (const ref of refs) git(REPO, ["update-ref", "-d", ref]);
  });

  test("captures the session, lists it, and push --dry-run shows the git command", async () => {
    const result = await $`claude -p --model claude-haiku-5-5 --output-format json ${PROMPT}`
      .cwd(REPO)
      .env({ ...process.env, THUNDERJAR_CAPTURE: "1" })
      .nothrow()
      .quiet();
    expect(result.exitCode).toBe(0);
    session = JSON.parse(result.stdout.toString()).session_id;
    expect(session).toMatch(/^[0-9a-f-]{36}$/);

    const log = await Bun.file(`${logDir(REPO)}/capture.log`).text();
    expect(log).toContain(`wrote refs/thunderjar/capture/${session}/start`);
    expect(log).toContain(`wrote refs/thunderjar/capture/${session}/turn-1`);

    const list = JSON.parse(await $`bun ${SCRIPTS}/list.ts --json`.cwd(REPO).text());
    const capture = list.find((entry: { session: string }) => entry.session === session);
    expect(capture).toMatchObject({ session, turns: 1, prompt: PROMPT });

    const push = await $`bun ${SCRIPTS}/push.ts --dry-run`.cwd(REPO).text();
    expect(push.trim()).toBe("git push --no-verify origin refs/thunderjar/capture/*:refs/thunderjar/capture/*");
  }, 180_000);
});
