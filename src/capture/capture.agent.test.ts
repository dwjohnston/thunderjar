/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: c5299d71-1f4b-4472-9950-df42605e10cc
 *
 * Humans: add your notes here
 */

// Session capture with real harnesses, each asked to "say hi". Skipped by `bun test`; run with
// `bun run test:agent`. Each harness runs only where its CLI is on PATH and signed in, and costs a
// fraction of a cent.
//
// Claude Code runs in this repository, whose .claude/settings.json wires up the capture hooks; the
// session's refs are deleted afterwards, and its lines stay in the log. The others run in a temporary
// repository, after `capture install`.
import { $ } from "bun";
import { afterAll, describe, expect, test } from "bun:test";
import { REPO_ROOT } from "../testing/scenario.ts";
import { logDir } from "./files.ts";
import { git, REF_PREFIX } from "./git.ts";

const CLI = `${REPO_ROOT}/src/cli/index.ts`;
const PROMPT = "say hi";
const ENABLED = !!Bun.env.THUNDERJAR_AGENT_TESTS;

/** The sessions captured in `repo`: one per `start` ref. */
const sessions = (repo: string) =>
  git(repo, ["for-each-ref", "--format=%(refname)", `${REF_PREFIX}/`])
    .split("\n")
    .filter((ref) => ref.endsWith("/start"))
    .map((ref) => ref.slice(REF_PREFIX.length + 1, -"/start".length));

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

/**
 * The other harnesses: each in a new repository with capture installed for it, run once on `PROMPT`.
 * Codex runs a hook only once it's trusted in `/hooks`, so its test needs that done for the
 * repository's `.codex/hooks.json` first. None of these has been run yet.
 */
const OTHERS = [
  { harness: "codex", binary: "codex", key: "OPENAI_API_KEY", run: (repo: string) => $`codex exec --skip-git-repo-check ${PROMPT}`.cwd(repo) },
  { harness: "copilot", binary: "copilot", key: "COPILOT_GITHUB_TOKEN", run: (repo: string) => $`copilot -p ${PROMPT} --allow-all-tools`.cwd(repo) },
  { harness: "opencode", binary: "opencode", key: "OPENCODE_API_KEY", run: (repo: string) => $`opencode run ${PROMPT}`.cwd(repo) },
].filter(({ binary, key }) => Bun.which(binary) && Bun.env[key]);

describe.skipIf(!ENABLED || OTHERS.length === 0)("capture, with other real harnesses", () => {
  const dirs: string[] = [];
  afterAll(async () => {
    for (const dir of dirs) await $`rm -rf ${dir}`.quiet();
  });

  test.each(OTHERS)("$harness: install, a session, and list shows it", async ({ harness, run }) => {
    const repo = `${Bun.env.TMPDIR ?? "/tmp"}/tj-capture-${harness}-${crypto.randomUUID()}`;
    dirs.push(repo);
    await $`mkdir -p ${repo} && git init -q -b main ${repo}`.quiet();
    await $`bun ${CLI} capture install --harness ${harness} --command ${`bun ${CLI}`}`.cwd(repo).quiet();

    const result = await run(repo).nothrow().quiet();
    expect(result.exitCode).toBe(0);

    const [session] = sessions(repo);
    expect(session).toBeDefined();
    expect(await listJson(repo)).toMatchObject([{ session, turns: 1, prompt: PROMPT, start: { agent: { harness } } }]);
  }, 300_000);
});
