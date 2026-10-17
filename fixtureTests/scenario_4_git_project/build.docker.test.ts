// Docker image tests for scenario 4's real-git parameters — spec/120-test-boundaries.md#31-generating-the-pre-run-image.
// Skipped by `bun test`; run with `bun run test:prepare && bun run test:docker`. Images are
// tagged in a throwaway repository and removed afterwards.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dockerCli } from "../../src/adapters/docker/docker.ts";
import { build } from "../../src/commands/build/build.ts";
import { scenarioFixtures } from "../helpers.ts";

const fixtures = scenarioFixtures(import.meta.dir);
const docker = dockerCli("docker");
const repository = `thunderjar-test-${process.pid}-${Date.now()}`;

const FIRST = "65bcb92cc069821e4695433b11582962ee6d68bd";
const SECOND = "5f52f9e08051a67c5ca0d630e2ce586a62819778";
const PROJECT = "fixtureTests/scenario_4_git_project/fixtures/project";

/** Runs `script` with sh in a throwaway container from `ref`. */
function inImage(ref: string, script: string) {
  const result = spawnSync("docker", ["run", "--rm", ref, "sh", "-c", script], { encoding: "utf8" });
  expect(result.stderr).toBe("");
  return result.stdout.trim();
}

describe.skipIf(!process.env.THUNDERJAR_TEST_DOCKER)("scenario 4 build, against real Docker", () => {
  const refs = new Map<string, string>();

  beforeAll(async () => {
    const unreachable = await docker.unreachable();
    if (unreachable) throw new Error(`Docker can't be reached (${unreachable}).`);
    if (!(await docker.imageExists("node:20-bookworm"))) {
      throw new Error("The fixture image node:20-bookworm is missing. Run `bun run test:prepare` first.");
    }
    const blocks: string[] = [];
    await build("two-commits", { cwd: fixtures, docker, repository, rootDir: await mkdtemp(join(tmpdir(), "thunderjar-")), log: (t) => blocks.push(t) });
    // Each permutation's row, by code state and prompt set, and the image it built.
    for (const [, codeState, promptSet, ref] of blocks.join("\n").matchAll(/\| (\w+) +\| ([\w-]+) +\|.*\n {4}(\S+) {2}built/g)) {
      refs.set(`${codeState}/${promptSet}`, ref!);
    }
    expect(refs.size).toBe(4);
  }, 300_000);

  afterAll(() => {
    const images = spawnSync("docker", ["image", "ls", "--format", "{{.Repository}}:{{.Tag}}", repository], { encoding: "utf8" })
      .stdout.split("\n")
      .filter(Boolean);
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
