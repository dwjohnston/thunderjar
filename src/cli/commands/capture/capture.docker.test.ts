/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: session_01LCLeLmJ8bpSKrwzpqUF38d
 *
 * Humans: add your notes here
 */

// `thunderjar capture` from a user's point of view, once per harness, each in its own container of
// the sample repo image: a codebase that has never had Thunderjar, with the harness's CLI.
//
//   1. start the image
//   2. install Thunderjar, from the packed package, and init
//   3. install capture for the harness, and run its hooks on recorded payloads
//   4. run a real two-turn job with the harness: only with THUNDERJAR_AGENT_TESTS=1 and its key
//
// Skipped by `bun test`; run with `bun run test:docker`, which CI runs too. The image must exist:
// `bun run di:build:sample-repo` builds it, and the tests fail, saying so, when it's missing or stale.
// Step 4 spends a fraction of a cent per harness. Claude Code uses ANTHROPIC_API_KEY; Codex,
// Copilot and OpenCode use OpenRouter, with OPENROUTER_API_KEY. A harness without its key skips it.
// slow-tests.yml runs it on `/slow-tests` and on release PRs. Locally:
//
//   THUNDERJAR_DOCKER_TESTS=1 THUNDERJAR_AGENT_TESTS=1 ANTHROPIC_API_KEY=… OPENROUTER_API_KEY=… \
//     bun test --concurrent --timeout 900000 src/cli/commands/capture/capture.docker.test.ts
import { $ } from "bun";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pkg from "../../../../package.json" with { type: "json" };
import type { HarnessId } from "../../../capture/adapters.ts";
import { REF_PREFIX } from "../../../capture/git.ts";
import { exec, packThunderjar, removeContainer, requireSampleRepoImage, startContainer } from "./sampleRepoImage.ts";

const ENABLED = !!Bun.env.THUNDERJAR_DOCKER_TESTS;
const AGENTS = !!Bun.env.THUNDERJAR_AGENT_TESTS;
const RUN_ID = crypto.randomUUID().slice(0, 8);
const PKG_DIR = `${Bun.env.TMPDIR ?? "/tmp"}/tj-capture-pkg-${RUN_ID}`;

type Harness = {
  id: HarnessId;
  /** The harness's CLI in the image. */
  binary: string;
  /** The file `capture install` writes, from /work. */
  config: string;
  /** What that file must hold: the hooks, run with plain `thunderjar`, found on PATH. */
  installed: string[];
  /** What the harness puts in a hook's environment, that its adapter checks for. */
  hookEnv: Record<string, string>;
  /** The variable whose key a real job needs: ANTHROPIC_API_KEY for Claude Code, OPENROUTER_API_KEY for the rest. */
  key: "ANTHROPIC_API_KEY" | "OPENROUTER_API_KEY";
  /** The environment a real job runs with, given the key. */
  jobEnv: (key: string) => Record<string, string>;
  /** The two turns of a real job, as shell scripts run in /work; turn 2 resumes turn 1's session. */
  turns: (turn1Stdout?: string) => [string, (turn1Stdout: string) => string];
  /** Why step 4 is skipped for this harness, if it is. */
  skipJob?: string;
};

/** The model Copilot and OpenCode run on, by its OpenRouter ID. */
const OPENROUTER_MODEL = "anthropic/claude-haiku-5.5";

/** Codex on OpenRouter: a model provider set on the command line, reading OPENROUTER_API_KEY. */
const CODEX_OPENROUTER = [
  "-c model_provider=openrouter",
  "-c model_providers.openrouter.name=OpenRouter",
  "-c model_providers.openrouter.base_url=https://openrouter.ai/api/v1",
  "-c model_providers.openrouter.env_key=OPENROUTER_API_KEY",
  "-c model_providers.openrouter.wire_api=responses",
  "-m openai/gpt-5.5",
].join(" ");

const HARNESSES: Harness[] = [
  {
    id: "claude-code",
    binary: "claude",
    config: ".claude/settings.local.json",
    installed: ["thunderjar capture prompt --harness claude-code", "thunderjar capture stop --harness claude-code"],
    hookEnv: { CLAUDECODE: "1" },
    key: "ANTHROPIC_API_KEY",
    jobEnv: (key) => ({ ANTHROPIC_API_KEY: key }),
    turns: () => [
      `claude -p --model claude-haiku-5-5 --output-format json "say hi"`,
      (out) => `claude -p --model claude-haiku-5-5 --resume ${JSON.parse(out).session_id} "now say bye"`,
    ],
  },
  {
    id: "codex",
    binary: "codex",
    config: ".codex/hooks.json",
    installed: ["thunderjar capture prompt --harness codex", "thunderjar capture stop --harness codex"],
    hookEnv: {},
    key: "OPENROUTER_API_KEY",
    jobEnv: (key) => ({ OPENROUTER_API_KEY: key }),
    turns: () => [
      `codex exec ${CODEX_OPENROUTER} --dangerously-bypass-hook-trust "say hi"`,
      () => `codex exec resume --last ${CODEX_OPENROUTER} --dangerously-bypass-hook-trust "now say bye"`,
    ],
  },
  {
    id: "copilot",
    binary: "copilot",
    config: ".github/hooks/thunderjar-capture.json",
    installed: ["thunderjar capture prompt --harness copilot", "thunderjar capture stop --harness copilot"],
    hookEnv: {},
    key: "OPENROUTER_API_KEY",
    // As .thunderjar's copilot-1.0.105 harness: Copilot's own provider settings, pointed at OpenRouter.
    jobEnv: (key) => ({
      COPILOT_PROVIDER_BASE_URL: "https://openrouter.ai/api/v1",
      COPILOT_PROVIDER_API_KEY: key,
      COPILOT_PROVIDER_MODEL_ID: OPENROUTER_MODEL.split("/").pop() as string,
    }),
    turns: () => [
      `copilot -p "say hi" --model ${OPENROUTER_MODEL} --allow-all-tools`,
      () => `copilot --continue -p "now say bye" --model ${OPENROUTER_MODEL} --allow-all-tools`,
    ],
  },
  {
    id: "opencode",
    binary: "opencode",
    config: ".opencode/plugins/thunderjar-capture.ts",
    installed: ['const COMMAND = "thunderjar";', "capture ${hook} --harness opencode"],
    hookEnv: {},
    key: "OPENROUTER_API_KEY",
    // As .thunderjar's opencode-1.19.5 harness: its built-in openrouter provider reads OPENROUTER_API_KEY.
    jobEnv: (key) => ({ OPENROUTER_API_KEY: key }),
    turns: () => [
      `opencode run --model openrouter/${OPENROUTER_MODEL} "say hi"`,
      () => `opencode run --model openrouter/${OPENROUTER_MODEL} --continue "now say bye"`,
    ],
  },
];

/** A recorded payload of each harness's hook, as `adapters.test.ts` has them, for a session in /work. */
function payloads(harness: HarnessId, session: string) {
  const base = { session_id: session, cwd: "/work" };
  switch (harness) {
    case "claude-code":
      return {
        prompt: { ...base, transcript_path: "/tmp/t.jsonl", permission_mode: "auto", hook_event_name: "UserPromptSubmit", prompt: "hi" },
        stop: { ...base, transcript_path: "/tmp/t.jsonl", permission_mode: "auto", hook_event_name: "Stop", last_assistant_message: "Done." },
      };
    case "codex":
      return {
        prompt: { ...base, turn_id: "t1", hook_event_name: "UserPromptSubmit", model: "gpt-5.5", permission_mode: "default", prompt: "hi" },
        stop: { ...base, turn_id: "t1", hook_event_name: "Stop", model: "gpt-5.5", permission_mode: "default", last_assistant_message: "Done." },
      };
    case "copilot":
      return {
        prompt: { ...base, hook_event_name: "UserPromptSubmit", prompt: "hi" },
        stop: { ...base, hook_event_name: "Stop", transcript_path: "/tmp/p.jsonl" },
      };
    case "opencode":
      return {
        prompt: { ...base, prompt: "hi", model: "opencode/claude-haiku-5-5" },
        stop: { ...base, model: "opencode/claude-haiku-5-5" },
      };
  }
}

type ListedCapture = {
  session: string;
  turns: number;
  prompt: string;
  start: { agent: { harness: string } };
  turnRecords: { prompt: string | null; agent: { model: string | null } }[];
};

let image: string;
let tarball: string;

describe.skipIf(!ENABLED)("capture, in the sample repo", () => {
  beforeAll(async () => {
    image = await requireSampleRepoImage();
    await $`mkdir -p ${PKG_DIR}`.quiet();
    tarball = await packThunderjar(PKG_DIR);
  }, 300_000);

  afterAll(async () => {
    await $`rm -rf ${PKG_DIR}`.quiet();
  });

  for (const harness of HARNESSES) {
    describe(harness.id, () => {
      const container = `tj-capture-${harness.id}-${RUN_ID}`;
      /** Runs `script` in the container, failing the test, with its output, if it fails. */
      const run = async (script: string, env: Record<string, string> = {}, stdin?: string) => {
        const result = await exec(container, script, env, stdin);
        if (result.exitCode !== 0) throw new Error(`\`${script}\` exited ${result.exitCode}:\n${result.stdout}${result.stderr}`);
        return result.stdout;
      };
      /** HEAD, the index and the status: what capture must leave as it found them. */
      const repoState = () => run("git rev-parse HEAD && git ls-files --stage | sha256sum && git status --porcelain");
      const listCaptures = async () => JSON.parse(await run("thunderjar capture list --json")) as ListedCapture[];

      afterAll(async () => {
        await removeContainer(container);
      });

      test.serial("1. start the image: a git repository with no Thunderjar, and the harness's CLI", async () => {
        await startContainer(image, container, [`${PKG_DIR}:/pkg:ro`]);
        expect((await run("git rev-list --count HEAD")).trim()).toBe("1");
        expect(await run("git status --porcelain")).toBe("");
        expect((await exec(container, "command -v thunderjar")).exitCode).not.toBe(0);
        expect((await exec(container, "test -e .thunderjar")).exitCode).not.toBe(0);
        expect(await run(`${harness.binary} --version`)).not.toBe("");
      }, 60_000);

      test.serial("2. install Thunderjar from the package, and init", async () => {
        await run(`bun add --global /pkg/${tarball.slice(PKG_DIR.length + 1)}`);
        expect((await run("thunderjar --version")).trim()).toBe(pkg.version);
        await run("thunderjar init");
        expect((await exec(container, "test -d .thunderjar")).exitCode).toBe(0);
      }, 300_000);

      test.serial("3. install capture for the harness, and its hooks capture a session", async () => {
        const out = await run(`thunderjar capture install --harness ${harness.id}`);
        expect(out).toContain(harness.config);
        const config = await run(`cat ${harness.config}`);
        for (const text of harness.installed) expect(config).toContain(text);
        // Found on PATH: the hooks run plain `thunderjar`, as the harness would.
        expect((await run("command -v thunderjar")).trim()).toBe("/home/node/.bun/bin/thunderjar");

        await run(`thunderjar capture install --harness ${harness.id}`);
        expect(await run(`cat ${harness.config}`)).toBe(config);

        const session = `recorded-${RUN_ID}`;
        const before = await repoState();
        for (const [hook, payload] of Object.entries(payloads(harness.id, session))) {
          const stdout = await run(`thunderjar capture ${hook} --harness ${harness.id}`, harness.hookEnv, JSON.stringify(payload));
          expect(stdout).toBe("");
        }
        expect(await repoState()).toBe(before);
        expect(await listCaptures()).toMatchObject([{ session, turns: 1, prompt: "hi", start: { agent: { harness: harness.id } } }]);

        // Step 4 starts with no captures.
        await run(`git for-each-ref --format='%(refname)' ${REF_PREFIX}/ | xargs -r -n1 git update-ref -d`);
        expect(await listCaptures()).toEqual([]);
      }, 120_000);

      const key = Bun.env[harness.key];
      test.serial.skipIf(!AGENTS || !key || !!harness.skipJob)(`4. a real two-turn ${harness.id} job is captured`, async () => {
        const env = harness.jobEnv(key as string);
        const [turn1, turn2] = harness.turns();
        const before = await repoState();
        const first = await run(turn1, env);
        await run(turn2(first), env);

        const captures = await listCaptures();
        expect(captures).toHaveLength(1);
        expect(captures[0]).toMatchObject({ turns: 2, prompt: "say hi", start: { agent: { harness: harness.id } } });
        expect(captures[0]!.turnRecords[1]!.prompt).toBe("now say bye");
        expect(await repoState()).toBe(before);
      }, 600_000);
    });
  }
});
