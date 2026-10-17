// Docker image tests for `build` — spec/120-test-boundaries.md#31-generating-the-pre-run-image.
// Docker and the images are real; the agent is the fake one. Skipped by `bun test`; run with
// `bun run test:prepare && bun run test:docker`. Each run tags its images in a throwaway
// repository and removes them afterwards.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dockerCli } from "../adapters/docker/docker.ts";
import { createFixtureProject, linkThunderjar, stub } from "../testing/fixture-project.ts";
import { SEED_COMMITS, seedRepo } from "../testing/seed-repo.ts";
import { build } from "./build.ts";

const BASE_IMAGE = "node:20-bookworm";
const docker = dockerCli("docker");
const repository = `thunderjar-test-${process.pid}-${Date.now()}`;

const tmp = () => mkdtemp(join(tmpdir(), "thunderjar-build-docker-"));

/** The fixture project, as the seed repository, with its code state and prompt set pinned to seed commits. */
async function seededProject() {
  const dir = await tmp();
  await createFixtureProject(dir, {
    "test-case-parameters/codeStates/baseline/index.ts": stub("declareCodeState", `{
  commit: "${SEED_COMMITS.baseline}",
  applyParameter: () => \`RUN npm ci\`,
}`),
    "test-case-parameters/promptSets/snerk/index.ts": stub("declarePromptSet", `{
  commit: "${SEED_COMMITS.prompts}",
  files: { "prompts/snerk.md": "FAKE_INSTRUCTIONS.md" },
  applyParameter: () => \`\`,
}`),
  });
  await linkThunderjar(dir);
  await seedRepo(dir);
  return dir;
}

/** Runs `script` with sh in a throwaway container from `ref`. */
function inImage(ref: string, script: string) {
  const result = spawnSync("docker", ["run", "--rm", ref, "sh", "-c", script], { encoding: "utf8" });
  expect(result.stderr).toBe("");
  return result.stdout.trim();
}

describe.skipIf(!process.env.THUNDERJAR_TEST_DOCKER)("build, against real Docker", () => {
  beforeAll(async () => {
    const unreachable = await docker.unreachable();
    if (unreachable) throw new Error(`Docker can't be reached (${unreachable}).`);
    if (!(await docker.imageExists(BASE_IMAGE))) {
      throw new Error(`The fixture image ${BASE_IMAGE} is missing. Run \`bun run test:prepare\` first.`);
    }
  });

  afterAll(() => {
    const images = spawnSync("docker", ["image", "ls", "--format", "{{.Repository}}:{{.Tag}}", repository], {
      encoding: "utf8",
    }).stdout.split("\n").filter(Boolean);
    if (images.length > 0) spawnSync("docker", ["image", "rm", "--force", ...images]);
  });

  test("fake-is-prime's prerun image has the code state's commit alone, the prompt file and the harness", async () => {
    const dir = await seededProject();
    const blocks: string[] = [];
    const options = { cwd: dir, docker, repository, rootDir: await tmp(), log: (text: string) => blocks.push(text) };

    await build("fake-is-prime", options);
    const ref = /^ {4}(\S+) {2}built /m.exec(blocks.join("\n"))![1]!;
    expect(ref).toStartWith(`${repository}:prerun-h`);

    // /workspace is at baseline's commit, detached, with no remote, and nothing after it in its history.
    expect(inImage(ref, "pwd && git rev-parse HEAD && git rev-parse --abbrev-ref HEAD")).toBe(
      `/workspace\n${SEED_COMMITS.baseline}\nHEAD`,
    );
    expect(inImage(ref, "git remote")).toBe("");
    expect(inImage(ref, "git log --all --format=%H")).toBe(SEED_COMMITS.baseline);
    // The prompt file from snerk's commit, a git identity for the agent, node, and the code state's npm ci.
    expect(inImage(ref, "head -1 FAKE_INSTRUCTIONS.md")).toBe("# Snerk");
    expect(inImage(ref, "git config user.email")).toBe("agent@thunderjar.invalid");
    expect(inImage(ref, "node --version")).toStartWith("v20.");
    expect(inImage(ref, "ls package.json package-lock.json")).toBe("package-lock.json\npackage.json");

    // A second build reuses it.
    blocks.length = 0;
    await build("fake-is-prime", options);
    expect(blocks.join("\n")).toContain(`    ${ref}  reused`);
  }, 300_000);
});
