// Docker image tests for `build` — spec/120-test-boundaries.md#31-generating-the-pre-run-image.
// Docker and the images are real; the agent is the fake one. Skipped by `bun test`; run with
// `bun run test:prepare && bun run test:docker`. Each run tags its images in a throwaway
// repository and removes them afterwards.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dockerCli } from "../../adapters/docker/docker.ts";
import { createFixtureProject, gitParameters, linkThunderjar } from "../../testing/fixture-project.ts";
import { SEED_COMMITS, seedRepo } from "../../testing/seed-repo.ts";
import { build } from "./build.ts";

const BASE_IMAGE = "node:20-bookworm";
const docker = dockerCli("docker");
const repository = `thunderjar-test-${process.pid}-${Date.now()}`;

const tmp = () => mkdtemp(join(tmpdir(), "thunderjar-build-docker-"));

/** The fixture project, whose parameters copy the files beside them; with `git`, the seed repository, read through ctx.git. */
async function fixtureProject({ git = false } = {}) {
  const dir = await tmp();
  await createFixtureProject(dir, git ? gitParameters(SEED_COMMITS.baseline, SEED_COMMITS.prompts) : {});
  await linkThunderjar(dir);
  if (git) await seedRepo(dir);
  return dir;
}

/** Builds fake-is-prime in `dir` and returns its prerun image, and a function that builds it again. */
async function buildFakeIsPrime(dir: string) {
  const blocks: string[] = [];
  const options = { cwd: dir, docker, repository, rootDir: await tmp(), log: (text: string) => blocks.push(text) };
  await build("fake-is-prime", options);
  const ref = /^ {4}(\S+) {2}built /m.exec(blocks.join("\n"))![1]!;
  expect(ref).toStartWith(`${repository}:prerun-h`);
  const again = async () => {
    blocks.length = 0;
    await build("fake-is-prime", options);
    return blocks.join("\n");
  };
  return { ref, again };
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

  test("copying files: /workspace holds the code state's and prompt set's files, and node", async () => {
    const { ref, again } = await buildFakeIsPrime(await fixtureProject());

    expect(inImage(ref, "pwd && ls -A")).toBe("/workspace\nFAKE_INSTRUCTIONS.md\npackage-lock.json\npackage.json");
    expect(inImage(ref, "head -1 FAKE_INSTRUCTIONS.md")).toBe("# Snerk");
    expect(inImage(ref, "node --version")).toStartWith("v20.");
    // A second build reuses it.
    expect(await again()).toContain(`    ${ref}  reused`);
  }, 300_000);

  test("checkoutCommit and ctx.git.show: the code state's commit alone, detached, and the prompt file at its commit", async () => {
    const { ref } = await buildFakeIsPrime(await fixtureProject({ git: true }));

    // /workspace is at baseline's commit, detached, with no remote and no branch, and nothing after it in its history.
    expect(inImage(ref, "pwd && git rev-parse HEAD && git rev-parse --abbrev-ref HEAD")).toBe(
      `/workspace\n${SEED_COMMITS.baseline}\nHEAD`,
    );
    expect(inImage(ref, "git remote && git for-each-ref refs/heads")).toBe("");
    expect(inImage(ref, "git log --all --format=%H")).toBe(SEED_COMMITS.baseline);
    // The prompt file from snerk's commit, a git identity for the agent, and the code state's npm ci.
    expect(inImage(ref, "head -1 CLAUDE.md")).toBe("# Snerk");
    expect(inImage(ref, "git config user.email")).toBe("agent@thunderjar.invalid");
    expect(inImage(ref, "ls package.json package-lock.json")).toBe("package-lock.json\npackage.json");
  }, 300_000);
});
