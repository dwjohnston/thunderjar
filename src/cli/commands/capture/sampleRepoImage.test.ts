/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: session_01LCLeLmJ8bpSKrwzpqUF38d
 *
 * Humans: add your notes here
 */

import { $ } from "bun";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { scenarioFolder } from "../../../testing/scenario.ts";
import { BUILD_ARGS, SAMPLE_REPO_SCENARIO, sampleRepoContext, sampleRepoTag } from "./sampleRepoImage.ts";

let folder: string;

beforeEach(async () => {
  folder = `${Bun.env.TMPDIR ?? "/tmp"}/tj-sample-repo-${crypto.randomUUID()}`;
  await $`cp -R ${scenarioFolder(SAMPLE_REPO_SCENARIO)} ${folder}`.quiet();
});

afterEach(async () => {
  await $`rm -rf ${folder}`.quiet();
});

const hash = async (buildArgs = BUILD_ARGS) => (await sampleRepoContext(folder, buildArgs)).hash;

describe("the sample repo image's hash", () => {
  test("is the same for the same inputs, and the scenario's own", async () => {
    expect(await hash()).toBe(await hash());
    expect(await hash()).toBe((await sampleRepoContext()).hash);
  });

  test("changes with the Dockerfile", async () => {
    const before = await hash();
    await Bun.write(`${folder}/Dockerfile`, `${await Bun.file(`${folder}/Dockerfile`).text()}\n# changed\n`);
    expect(await hash()).not.toBe(before);
  });

  test("changes with a project file, or a new one", async () => {
    const before = await hash();
    await Bun.write(`${folder}/project/README.md`, "changed\n");
    const edited = await hash();
    expect(edited).not.toBe(before);
    await Bun.write(`${folder}/project/new.txt`, "new\n");
    expect(await hash()).not.toBe(edited);
  });

  test("changes with a harness version", async () => {
    expect(await hash({ ...BUILD_ARGS, CODEX_VERSION: "0.0.1" })).not.toBe(await hash());
  });

  test("names the tag", () => {
    expect(sampleRepoTag("1a2b3c4d5e6f")).toBe("thunderjar-sample-repo:h1a2b3c4d");
  });
});

test("the build args pin each harness at its starter version", () => {
  expect(BUILD_ARGS).toEqual({
    BUN_VERSION: expect.stringMatching(/^\d+\.\d+\.\d+$/),
    CLAUDE_CODE_VERSION: "2.1.311",
    CODEX_VERSION: "0.166.0",
    COPILOT_VERSION: "1.0.105",
    OPENCODE_VERSION: "1.19.5",
  });
});
