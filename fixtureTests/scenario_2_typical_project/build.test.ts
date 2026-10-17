// `thunderjar build` in a typical project, against the recording fake Docker: which Docker
// commands are issued, in what order, and what lands in each build context
// (spec/120-test-boundaries.md#2-cli-with-recording-adapters). The project is a copy of
// fixtures/ that is also the seed repository, whose commits its code state and prompt sets pin.
// By hand, against real Docker:
//
//   bun run fixture scenario_2 build two-pairs

import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SEED_COMMITS } from "../../src/testing/seed-repo.ts";
import { copyOfFixtures, fakeDocker, scenarioFixtures, seededCopyOfFixtures, thunderjar } from "../helpers.ts";

const fixtures = scenarioFixtures(import.meta.dir);

/** Builds in a seeded copy, keeping build contexts under a fresh $TMPDIR. */
async function build(testCase: string, docker: Awaited<ReturnType<typeof fakeDocker>>, dir?: string) {
  const project = dir ?? (await seededCopyOfFixtures(fixtures));
  const tmpDir = await mkdtemp(join(tmpdir(), "thunderjar-fixture-tmp-"));
  const result = await thunderjar(project, ["build", testCase], { ...docker.env, TMPDIR: tmpDir });
  const normalise = (text: string) => text.replaceAll(tmpDir, "$TMPDIR").replace(/ built \(\d+\.\d\ds\)$/gm, " built (<t>s)");
  return {
    ...result,
    stdout: normalise(result.stdout),
    stderr: normalise(result.stderr),
    commands: docker.commands().map(normalise),
    builds: join(tmpDir, "thunderjar", "builds"),
  };
}

const ALPHA = "thunderjar:prerun-h2123ef92";
const BETA = "thunderjar:prerun-h3d8b805c";

test("build two-pairs: builds each missing prerun image, and stops", async () => {
  const docker = await fakeDocker();
  const { stdout, stderr, exitCode, commands } = await build("two-pairs", docker);

  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  // The tags are those `thunderjar plan two-pairs` shows.
  expect(stdout).toBe(`Building 2 prerun images for two-pairs (2 permutations)
Build contexts in $TMPDIR/thunderjar/builds

 1  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | terse
    ${ALPHA}  built (<t>s)

 2  node20 | baseline | snerk | fake-harness-beta@1.0.0/fake-model-large  | terse
    ${BETA}  built (<t>s)

2 prerun images: 2 built, 0 reused
`);
  // Whether Docker is there, which images exist, then a build for each that doesn't. Nothing is run.
  expect(commands).toEqual([
    "docker version --format {{.Server.Version}}",
    `docker image inspect --format {{.Id}} ${ALPHA}`,
    `docker image inspect --format {{.Id}} ${BETA}`,
    `docker build --tag ${ALPHA} $TMPDIR/thunderjar/builds/prerun-h2123ef92`,
    `docker build --tag ${BETA} $TMPDIR/thunderjar/builds/prerun-h3d8b805c`,
  ]);
});

test("each build context holds the permutation's Dockerfile, the code state's bundle and the prompt files", async () => {
  const { builds } = await build("two-pairs", await fakeDocker());

  const context = join(builds, "prerun-h2123ef92");
  expect(readdirSync(context, { recursive: true }).map(String).toSorted()).toEqual([
    "Dockerfile",
    "code.bundle",
    "prompt-set",
    join("prompt-set", "FAKE_INSTRUCTIONS.md"),
  ]);
  expect(readFileSync(join(context, "Dockerfile"), "utf8")).toBe(`FROM node:20-bookworm
COPY code.bundle /tmp/code.bundle
RUN git clone --quiet /tmp/code.bundle /workspace \\
  && git -C /workspace checkout --quiet --detach ${SEED_COMMITS.baseline} \\
  && git -C /workspace remote remove origin \\
  && git -C /workspace config user.name "Thunderjar agent" \\
  && git -C /workspace config user.email agent@thunderjar.invalid \\
  && rm /tmp/code.bundle
WORKDIR /workspace
RUN npm ci
COPY prompt-set/FAKE_INSTRUCTIONS.md /workspace/FAKE_INSTRUCTIONS.md
RUN echo "install fake-harness-alpha@1.0.0"
`);
  // The prompt file, read at the prompt set's commit rather than from the worktree.
  expect(readFileSync(join(context, "prompt-set", "FAKE_INSTRUCTIONS.md"), "utf8")).toStartWith("# Snerk\n");
  // The other permutation installs the other harness.
  expect(readFileSync(join(builds, "prerun-h3d8b805c", "Dockerfile"), "utf8")).toContain(
    `RUN echo "install fake-harness-beta@1.0.0"\n`,
  );
});

test("build again: every image exists, so nothing is built and no commit is read", async () => {
  const docker = await fakeDocker([ALPHA, BETA]);
  // Not a git repository at all: an existing image needs no commit.
  const { stdout, exitCode, commands } = await build("two-pairs", docker, await copyOfFixtures(fixtures));

  expect(exitCode).toBe(0);
  expect(stdout).toBe(`Every prerun image for two-pairs exists (2 permutations)

 1  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | terse
    ${ALPHA}  reused

 2  node20 | baseline | snerk | fake-harness-beta@1.0.0/fake-model-large  | terse
    ${BETA}  reused

2 prerun images: 0 built, 2 reused
`);
  expect(commands.filter((c) => c.startsWith("docker build"))).toEqual([]);
});

test("only the missing images are built; plan then shows every image as reused", async () => {
  const docker = await fakeDocker([BETA]);
  const project = await seededCopyOfFixtures(fixtures);
  const { stdout, commands } = await build("two-pairs", docker, project);

  expect(stdout).toContain(`    ${ALPHA}  built (<t>s)\n`);
  expect(stdout).toContain(`    ${BETA}  reused\n`);
  expect(stdout).toEndWith("2 prerun images: 1 built, 1 reused\n");
  expect(commands.filter((c) => c.startsWith("docker build"))).toEqual([
    `docker build --tag ${ALPHA} $TMPDIR/thunderjar/builds/prerun-h2123ef92`,
  ]);

  const plan = await thunderjar(project, ["plan", "two-pairs"], docker.env);
  expect(plan.stdout).toContain("    prerun-h2123ef92 (exists, reused)\n");
  expect(plan.stdout).toContain("    prerun-h3d8b805c (exists, reused)\n");
});

test("a commit that isn't in the repository stops the build before anything is built", async () => {
  const docker = await fakeDocker();
  const { stdout, stderr, exitCode, commands } = await build("unpushed-commit", docker);

  expect(exitCode).toBe(1);
  expect(stdout).toBe("");
  expect(stderr).toBe(`error: commit a1b2c3 (code state "unpushed") is not in this repository.
Fetch it, or check that it has been pushed.
`);
  expect(commands.filter((c) => c.startsWith("docker build"))).toEqual([]);
});

test("a project outside any git repository can't be built", async () => {
  const project = await copyOfFixtures(fixtures);
  const { stderr, exitCode, commands } = await build("two-pairs", await fakeDocker(), project);

  expect(exitCode).toBe(1);
  expect(stderr).toBe(
    `error: ${project} is not in a git repository. Prerun images are built from code state and prompt set commits in it.\n`,
  );
  expect(commands.filter((c) => c.startsWith("docker build"))).toEqual([]);
});

test("without Docker, build stops before reading anything", async () => {
  const docker = await fakeDocker([], ["unreachable"]);
  const { stdout, stderr, exitCode, commands } = await build("two-pairs", docker);

  expect(exitCode).toBe(1);
  expect(stdout).toBe("");
  expect(stderr).toBe(
    "error: Docker can't be reached (Cannot connect to the Docker daemon at unix:///var/run/docker.sock. " +
      "Is the docker daemon running?). Building prerun images needs Docker.\n",
  );
  expect(commands).toEqual(["docker version --format {{.Server.Version}}"]);
});

test("a failed build stops, and keeps its build context for inspection", async () => {
  const docker = await fakeDocker([], ["fail-build"]);
  const { stdout, stderr, exitCode, commands, builds } = await build("two-pairs", docker);

  expect(exitCode).toBe(1);
  expect(stdout).toEndWith(" 1  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | terse\n");
  expect(stderr).toBe(`fake docker: the build failed
error: building ${ALPHA} failed (docker build exited 1).
Its build context is kept in $TMPDIR/thunderjar/builds/prerun-h2123ef92
`);
  expect(commands.filter((c) => c.startsWith("docker build"))).toHaveLength(1);
  expect(readdirSync(join(builds, "prerun-h2123ef92"))).toContain("Dockerfile");
});

test("build with no test case prints its usage", async () => {
  const { stderr, exitCode } = await thunderjar(fixtures, ["build"]);
  expect(exitCode).toBe(1);
  expect(stderr).toBe("usage: thunderjar build <test case>\n");
});
