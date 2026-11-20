/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: c5299d71-1f4b-4472-9950-df42605e10cc
 *
 * Humans: add your notes here
 */

import { $ } from "bun";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { HARNESSES } from "../../../capture/adapters.ts";
import { REPO_ROOT } from "../../../testing/scenario.ts";
import { configPath } from "./install.ts";
import { OPENCODE_VERSION } from "./opencodePlugin.ts";

const CLI = `${REPO_ROOT}/src/cli/index.ts`;

let dir: string;
let repo: string;
let home: string;

/** `thunderjar <args…>` in the repository, with `stdin`, and a home folder of its own. */
async function thunderjar(args: string[], options: { stdin?: string; env?: Record<string, string> } = {}) {
  const env = { ...Bun.env, HOME: home, CODEX_HOME: "", COPILOT_HOME: "", XDG_CONFIG_HOME: "", CLAUDECODE: "", CLAUDE_CODE_REMOTE: "", THUNDERJAR_CAPTURE_STORE: "", ...options.env };
  const command = options.stdin === undefined ? $`bun ${CLI} ${args}` : $`bun ${CLI} ${args} < ${new Response(options.stdin)}`;
  const result = await command.cwd(repo).env(env).quiet().nothrow();
  return { stdout: result.stdout.toString(), stderr: result.stderr.toString(), exitCode: result.exitCode };
}

const paths = () => ({ root: repo, home, env: {} });
const read = (path: string) => Bun.file(path).text();

beforeEach(async () => {
  dir = `${Bun.env.TMPDIR ?? "/tmp"}/tj-capture-cli-test-${crypto.randomUUID()}`;
  repo = `${dir}/repo`;
  home = `${dir}/home`;
  await $`mkdir -p ${repo} ${home} && git init -q -b main ${repo}`.quiet();
});

afterEach(async () => {
  await $`rm -rf ${dir}`.quiet();
});

describe("capture install and uninstall", () => {
  test("writes each harness's config, and a second install changes nothing", async () => {
    const result = await thunderjar(["capture", "install", "--harness", ...HARNESSES, "--command", "tj"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("open `/hooks` in Codex");

    const claude = await Bun.file(configPath("claude-code", "project", paths())).json();
    expect(claude.hooks.UserPromptSubmit[0].hooks[0]).toEqual({ type: "command", command: "tj capture prompt --harness claude-code", timeout: 60 });
    expect(claude.hooks.Stop[0].hooks[0].command).toBe("tj capture stop --harness claude-code");
    const codex = await Bun.file(configPath("codex", "project", paths())).json();
    expect(codex.hooks.Stop[0].hooks[0].command).toBe("tj capture stop --harness codex");
    const copilot = await Bun.file(configPath("copilot", "project", paths())).json();
    expect(copilot).toEqual({
      version: 1,
      hooks: {
        UserPromptSubmit: [{ type: "command", bash: "tj capture prompt --harness copilot", timeoutSec: 60 }],
        Stop: [{ type: "command", bash: "tj capture stop --harness copilot", timeoutSec: 120 }],
      },
    });
    const opencode = await read(configPath("opencode", "project", paths()));
    expect(opencode).toContain('const COMMAND = "tj";');
    expect(opencode).toContain(`OpenCode ${OPENCODE_VERSION}`);

    const files = await Promise.all(HARNESSES.map((h) => read(configPath(h, "project", paths()))));
    await thunderjar(["capture", "install", "--harness", ...HARNESSES, "--command", "tj"]);
    expect(await Promise.all(HARNESSES.map((h) => read(configPath(h, "project", paths()))))).toEqual(files);
  });

  test("merges into existing settings, and uninstall restores them", async () => {
    const settingsPath = configPath("claude-code", "project", paths());
    const original = {
      permissions: { allow: ["Bash(ls)"] },
      hooks: { Stop: [{ hooks: [{ type: "command", command: "echo done" }] }], PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "x" }] }] },
    };
    await Bun.write(settingsPath, JSON.stringify(original), { createPath: true });

    await thunderjar(["capture", "install", "--harness", "claude-code", "codex", "copilot", "opencode"]);
    const installed = await Bun.file(settingsPath).json();
    expect(installed.permissions).toEqual(original.permissions);
    expect(installed.hooks.Stop).toHaveLength(2);

    const result = await thunderjar(["capture", "uninstall", "--harness", "claude-code", "codex", "copilot", "opencode"]);
    expect(result.exitCode).toBe(0);
    expect(await Bun.file(settingsPath).json()).toEqual(original);
    for (const harness of ["codex", "copilot", "opencode"] as const) expect(await Bun.file(configPath(harness, "project", paths())).exists()).toBe(false);
  });

  test("--user writes into the home folder", async () => {
    await thunderjar(["capture", "install", "--harness", "claude-code", "--user"]);
    expect(await Bun.file(`${home}/.claude/settings.json`).exists()).toBe(true);
    expect(await Bun.file(`${repo}/.claude/settings.local.json`).exists()).toBe(false);
  });

  test("warns when thunderjar isn't on PATH", async () => {
    const result = await thunderjar(["capture", "install", "--harness", "codex"], { env: { PATH: `${Bun.env.PATH?.split(":").filter((p) => !p.includes("thunderjar")).join(":")}` } });
    if (Bun.which("thunderjar")) return;
    expect(result.stderr).toContain("`thunderjar` isn't on PATH");
  });
});

describe("capture prompt and stop", () => {
  const payload = (extra: object) => JSON.stringify({ session_id: "cli-session", cwd: repo, model: "gpt-5.5", ...extra });

  test("leave refs, print nothing, and list shows the capture", async () => {
    await Bun.write(`${repo}/a.txt`, "a");
    const prompt = await thunderjar(["capture", "prompt", "--harness", "codex"], { stdin: payload({ prompt: "make b" }) });
    await Bun.write(`${repo}/b.txt`, "b");
    const stop = await thunderjar(["capture", "stop", "--harness", "codex"], { stdin: payload({ turn_id: "t1" }) });

    for (const result of [prompt, stop]) expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
    const refs = (await $`git for-each-ref ${"--format=%(refname)"} refs/thunderjar`.cwd(repo).text()).trim().split("\n");
    expect(refs).toEqual(["refs/thunderjar/capture/cli-session/start", "refs/thunderjar/capture/cli-session/turn-1"]);

    const list = await thunderjar(["capture", "list", "--json"]);
    expect(JSON.parse(list.stdout)).toMatchObject([
      { session: "cli-session", verdict: "one-shot", turns: 1, prompt: "make b", turnRecords: [{ agent: { harness: "codex", model: "gpt-5.5", turnId: "t1" } }] },
    ]);
    const table = await thunderjar(["capture", "list"]);
    expect(table.stdout).toMatch(/Harness.*\n.*codex\s+one-shot\s+1\s+cli-session\s+make b/);
  });

  test("never fail: bad input, an unknown harness, or outside a repository", async () => {
    expect(await thunderjar(["capture", "prompt", "--harness", "codex"], { stdin: "not json" })).toEqual({ stdout: "", stderr: "", exitCode: 0 });
    expect(await thunderjar(["capture", "stop", "--harness", "nope"], { stdin: "{}" })).toEqual({ stdout: "", stderr: "", exitCode: 0 });
    expect(await Bun.file(`${repo}/.thunderjar/logs/capture.log`).text()).toContain("JSON");
  });

  test("THUNDERJAR_CAPTURE=0 switches it off", async () => {
    await thunderjar(["capture", "prompt", "--harness", "codex"], { stdin: payload({ prompt: "x" }), env: { THUNDERJAR_CAPTURE: "0" } });
    expect(await $`git for-each-ref refs/thunderjar`.cwd(repo).text()).toBe("");
  });
});

describe("capture show", () => {
  const payload = (extra: object) => JSON.stringify({ session_id: "s1", cwd: repo, ...extra });
  const capture = async (env: Record<string, string> = {}) => {
    await thunderjar(["capture", "prompt", "--harness", "codex"], { stdin: payload({ prompt: "make b" }), env });
    await Bun.write(`${repo}/b.txt`, "b");
    await thunderjar(["capture", "stop", "--harness", "codex"], { stdin: payload({ turn_id: "t1" }), env });
  };

  test("prints a header, then each record's subject and JSON", async () => {
    await capture();
    const result = await thunderjar(["capture", "show", "s1"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toStartWith(
      "Session: s1\nStore: refs\nFetch: git fetch origin 'refs/thunderjar/capture/s1/*:refs/thunderjar/capture/s1/*'\n\nthunderjar capture: s1 start\n{",
    );
    expect(result.stdout).toContain('"prompt": "make b"');
    expect(result.stdout).toContain("\n\nthunderjar capture: s1 turn-1\n{");
  });

  test("--json, from the branch store, whatever THUNDERJAR_CAPTURE_STORE says", async () => {
    await capture({ THUNDERJAR_CAPTURE_STORE: "branch" });
    const result = await thunderjar(["capture", "show", "s1", "--json"], { env: { THUNDERJAR_CAPTURE_STORE: "refs" } });
    expect(JSON.parse(result.stdout)).toMatchObject({
      session: "s1",
      store: "branch",
      records: [
        { subject: "thunderjar capture: s1 start", record: { prompt: "make b" } },
        { subject: "thunderjar capture: s1 turn-1", record: { agent: { turnId: "t1" } } },
      ],
    });
    expect((await thunderjar(["capture", "show", "s1"])).stdout).toContain("Fetch: git fetch origin refs/heads/thunderjar/capture/s1:refs/heads/thunderjar/capture/s1");
  });

  test("fails for a session it can't find", async () => {
    for (const session of ["nope", "../bad"]) {
      const result = await thunderjar(["capture", "show", session]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(`No capture of session ${session}`);
    }
  });
});

describe("capture push", () => {
  const payload = (extra: object) => JSON.stringify({ session_id: "cli-session", cwd: repo, ...extra });
  const capture = async (env: Record<string, string> = {}) => {
    await thunderjar(["capture", "prompt", "--harness", "codex"], { stdin: payload({ prompt: "p" }), env });
    await thunderjar(["capture", "stop", "--harness", "codex"], { stdin: payload({}), env });
  };

  test("--dry-run prints the git command, for the stores that have captures", async () => {
    expect((await thunderjar(["capture", "push", "--dry-run"])).stdout).toBe("No captures to push.\n");
    expect((await thunderjar(["capture", "pull", "--dry-run", "upstream"])).stdout).toBe(
      "git fetch upstream refs/thunderjar/capture/*:refs/thunderjar/capture/* refs/heads/thunderjar/capture/*:refs/heads/thunderjar/capture/*\n",
    );
    // The old spelling still works.
    expect((await thunderjar(["capture", "push", "--dry-run", "--fetch", "upstream"])).stdout).toBe(
      "git fetch upstream refs/thunderjar/capture/*:refs/thunderjar/capture/* refs/heads/thunderjar/capture/*:refs/heads/thunderjar/capture/*\n",
    );
    await capture({ CLAUDE_CODE_REMOTE: "true" });
    expect((await thunderjar(["capture", "push", "--dry-run"])).stdout).toBe(
      "git push --no-verify origin refs/heads/thunderjar/capture/*:refs/heads/thunderjar/capture/*\n",
    );
  });

  test("THUNDERJAR_CAPTURE_STORE=refs overrides a cloud session", async () => {
    await capture({ CLAUDE_CODE_REMOTE: "true", THUNDERJAR_CAPTURE_STORE: "refs" });
    expect((await thunderjar(["capture", "push", "--dry-run"])).stdout).toBe("git push --no-verify origin refs/thunderjar/capture/*:refs/thunderjar/capture/*\n");
  });
});

describe("capture push --session", () => {
  const prompt = (env: Record<string, string>) =>
    thunderjar(["capture", "prompt", "--harness", "codex"], { stdin: JSON.stringify({ session_id: "s1", cwd: repo, prompt: "p" }), env });

  test("--dry-run pushes only that session, in either store", async () => {
    await prompt({ CLAUDE_CODE_REMOTE: "true" });
    expect((await thunderjar(["capture", "push", "--session", "s1", "--dry-run"])).stdout).toBe(
      "git push --no-verify origin refs/heads/thunderjar/capture/s1:refs/heads/thunderjar/capture/s1\n",
    );
    await thunderjar(["capture", "prompt", "--harness", "codex"], { stdin: JSON.stringify({ session_id: "s2", cwd: repo, prompt: "p" }), env: { THUNDERJAR_CAPTURE_STORE: "refs" } });
    expect((await thunderjar(["capture", "push", "--session", "s2", "--dry-run"])).stdout).toBe(
      "git push --no-verify origin refs/thunderjar/capture/s2/*:refs/thunderjar/capture/s2/*\n",
    );
  });

  test("fails for a session with no capture", async () => {
    const result = await thunderjar(["capture", "push", "--session", "nope"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("No capture of session nope. `thunderjar capture list` shows the captures.");
  });
});

describe("capture import", () => {
  test("copies branch captures into refs, once", async () => {
    await thunderjar(["capture", "prompt", "--harness", "codex"], {
      stdin: JSON.stringify({ session_id: "s1", cwd: repo, prompt: "p" }),
      env: { THUNDERJAR_CAPTURE_STORE: "branch" },
    });
    const first = await thunderjar(["capture", "import"]);
    expect(first.stdout).toBe("imported refs/thunderjar/capture/s1/start\n1 imported, 0 already there.\n");
    const again = await thunderjar(["capture", "import", "--json"]);
    expect(JSON.parse(again.stdout)).toEqual({ imported: [], skipped: ["refs/thunderjar/capture/s1/start"] });
    expect((await $`git branch --list ${"thunderjar/capture/*"} --format=${"%(refname:short)"}`.cwd(repo).text()).trim()).toBe("thunderjar/capture/s1");
  });
});
