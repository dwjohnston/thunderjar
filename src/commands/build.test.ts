// `build` with parameters that read commits through ctx.git, the way `init` scaffolds them. The
// fixtureTests/ scenarios copy files instead, so the git path is covered here, against a
// throwaway project that is also the seed repository (src/testing/seed-repo.ts).

import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { memoryDocker } from "../testing/fake-docker.ts";
import { createFixtureProject, gitParameters, linkThunderjar } from "../testing/fixture-project.ts";
import { SEED_COMMITS, seedRepo } from "../testing/seed-repo.ts";
import { build } from "./build.ts";

const tmp = () => mkdtemp(join(tmpdir(), "thunderjar-build-"));

async function project(commit = SEED_COMMITS.baseline, promptCommit = SEED_COMMITS.prompts, { seeded = true } = {}) {
  const dir = await tmp();
  await createFixtureProject(dir, gitParameters(commit, promptCommit));
  await linkThunderjar(dir);
  if (seeded) await seedRepo(dir);
  return dir;
}

async function building(dir: string) {
  const docker = memoryDocker();
  const rootDir = await tmp();
  const blocks: string[] = [];
  const result = build("fake-is-prime", { cwd: dir, docker, rootDir, log: (text) => blocks.push(text) });
  return { result, docker, rootDir, output: () => blocks.join("\n") };
}

test("a code state's checkoutCommit and a prompt set's ctx.git.show land in the build context", async () => {
  const { result, docker, rootDir } = await building(await project());
  await result;

  expect(docker.builds).toHaveLength(1);
  const [context] = readdirSync(join(rootDir, "builds"));
  const dir = join(rootDir, "builds", context!);
  expect(readdirSync(join(dir, "git"), { recursive: true }).map(String).toSorted()).toEqual(
    [
      `${SEED_COMMITS.baseline}.bundle`,
      SEED_COMMITS.prompts,
      join(SEED_COMMITS.prompts, "prompts"),
      join(SEED_COMMITS.prompts, "prompts", "snerk.md"),
    ].toSorted(),
  );
  const dockerfile = readFileSync(join(dir, "Dockerfile"), "utf8");
  expect(dockerfile).toContain(`WORKDIR /workspace\nCOPY git/${SEED_COMMITS.baseline}.bundle /tmp/code.bundle\n`);
  expect(dockerfile).toContain(`\nCOPY git/${SEED_COMMITS.prompts}/prompts/snerk.md /workspace/CLAUDE.md\n`);
});

test("a commit that isn't in the repository stops the build before anything is built, naming each parameter", async () => {
  const { result, docker } = await building(await project("a1b2c3", "e4f5a6"));

  await expect(result).rejects.toThrow(`error: commit a1b2c3 (code state "baseline") is not in this repository.
Fetch it, or check that it has been pushed.
error: commit e4f5a6 (prompt set "snerk") is not in this repository.
Fetch it, or check that it has been pushed.`);
  expect(docker.builds).toEqual([]);
});

test("a project that reads commits must be in a git repository", async () => {
  const dir = await project(undefined, undefined, { seeded: false });
  const { result, docker } = await building(dir);

  await expect(result).rejects.toThrow(
    `error: ${dir} is not in a git repository, but code state "baseline" reads commit ${SEED_COMMITS.baseline} from it.`,
  );
  expect(docker.builds).toEqual([]);
});
