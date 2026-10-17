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
import { scenario } from "../../testing/cli.ts";
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

// Scenario 4's parameters read real commits of this repository, so its images show what the git
// path builds from a checked-in project: `bun run fixture scenario_4 build two-commits`.
describe.skipIf(!process.env.THUNDERJAR_TEST_DOCKER)("scenario 4 build, against real Docker", () => {
  const FIRST = "65bcb92cc069821e4695433b11582962ee6d68bd";
  const SECOND = "5f52f9e08051a67c5ca0d630e2ce586a62819778";
  const PROJECT = "fixtureTests/scenario_4_git_project/fixtures/project";
  const refs = new Map<string, string>();

  beforeAll(async () => {
    const unreachable = await docker.unreachable();
    if (unreachable) throw new Error(`Docker can't be reached (${unreachable}).`);
    if (!(await docker.imageExists(BASE_IMAGE))) {
      throw new Error(`The fixture image ${BASE_IMAGE} is missing. Run \`bun run test:prepare\` first.`);
    }
    const blocks: string[] = [];
    await build("two-commits", { cwd: scenario("scenario_4_git_project"), docker, repository, rootDir: await tmp(), log: (t) => blocks.push(t) });
    // Each permutation's row, by code state and prompt set, and the image it built.
    for (const [, codeState, promptSet, ref] of blocks.join("\n").matchAll(/\| (\w+) +\| ([\w-]+) +\|.*\n {4}(\S+) {2}built/g)) {
      refs.set(`${codeState}/${promptSet}`, ref!);
    }
    expect(refs.size).toBe(4);
  }, 300_000);

  afterAll(() => {
    const images = spawnSync("docker", ["image", "ls", "--format", "{{.Repository}}:{{.Tag}}", repository], {
      encoding: "utf8",
    }).stdout.split("\n").filter(Boolean);
    if (images.length > 0) spawnSync("docker", ["image", "rm", "--force", ...images]);
  });

  test("the first code state: this repository at the first commit, detached, with nothing after it", () => {
    const ref = refs.get("first/house-style-second")!;
    expect(inImage(ref, "git rev-parse HEAD && git rev-parse --abbrev-ref HEAD")).toBe(`${FIRST}\nHEAD`);
    expect(inImage(ref, "git remote && git for-each-ref refs/heads")).toBe("");
    expect(inImage(ref, `git log --all --format=%H | grep -c ${SECOND} || true`)).toBe("0");
    expect(inImage(ref, `ls ${PROJECT}`)).toBe("greet.js\npackage-lock.json\npackage.json\nprompts");
    // The prompt set reads its own commit, later than the code state's.
    expect(inImage(ref, "head -1 HOUSE_STYLE.md")).toBe("# House style (second commit)");
  });

  test("the second code state: the second commit, with the file it added", () => {
    const ref = refs.get("second/house-style-first")!;
    expect(inImage(ref, "git rev-parse HEAD")).toBe(SECOND);
    expect(inImage(ref, `ls ${PROJECT}/farewell.js && cat ${PROJECT}/greet.js | tail -1`)).toBe(
      `${PROJECT}/farewell.js\nexport const greet = (name) => \`Hello, \${name}!\`;`,
    );
    expect(inImage(ref, "head -1 HOUSE_STYLE.md")).toBe("# House style (first commit)");
  });
});
