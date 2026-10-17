// `thunderjar build` in a typical project, against the recording fake Docker: which Docker
// commands are issued, in what order, and what lands in each build context
// (spec/120-test-boundaries.md#2-cli-with-recording-adapters). Its parameters copy the files
// beside their declarations, so it builds in place, with no commits to read. By hand, against
// real Docker:
//
//   bun run fixture scenario_2 build two-pairs

import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyOfFixtures, fakeDocker, scenarioFixtures, thunderjar } from "../helpers.ts";

const fixtures = scenarioFixtures(import.meta.dir);

/** Builds in `project`, fixtures/ by default, keeping build contexts under a fresh $TMPDIR. */
async function build(testCase: string, docker: Awaited<ReturnType<typeof fakeDocker>>, project = fixtures) {
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

const ALPHA = "thunderjar:prerun-hefe85dda";
const BETA = "thunderjar:prerun-h56ea4852";

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
    `docker build --tag ${ALPHA} $TMPDIR/thunderjar/builds/prerun-hefe85dda`,
    `docker build --tag ${BETA} $TMPDIR/thunderjar/builds/prerun-h56ea4852`,
  ]);
});

test("each build context holds the permutation's Dockerfile and each parameter's folder", async () => {
  const { builds } = await build("two-pairs", await fakeDocker());

  const context = join(builds, "prerun-hefe85dda");
  expect(readdirSync(context, { recursive: true }).map(String).toSorted()).toEqual(
    [
      "Dockerfile",
      "parameters",
      join("parameters", "baseImage"),
      join("parameters", "baseImage", "index.ts"),
      join("parameters", "codeState"),
      join("parameters", "codeState", "files"),
      join("parameters", "codeState", "files", "package-lock.json"),
      join("parameters", "codeState", "files", "package.json"),
      join("parameters", "codeState", "index.ts"),
      // The family folder, less models.ts, versions.ts and collectTokenCosts.ts: not part of its hash.
      join("parameters", "harnessModel"),
      join("parameters", "harnessModel", "index.ts"),
      join("parameters", "promptSet"),
      join("parameters", "promptSet", "FAKE_INSTRUCTIONS.md"),
      join("parameters", "promptSet", "index.ts"),
    ].toSorted(),
  );
  // Each fragment in order, with Thunderjar's WORKDIR before the code state: nothing else is Thunderjar's.
  expect(readFileSync(join(context, "Dockerfile"), "utf8")).toBe(`FROM node:20-bookworm
RUN echo "install fake-harness-alpha@1.0.0"
WORKDIR /workspace
COPY parameters/codeState/files/ /workspace/
RUN npm ci
COPY parameters/promptSet/FAKE_INSTRUCTIONS.md /workspace/FAKE_INSTRUCTIONS.md
`);
  expect(readFileSync(join(context, "parameters", "promptSet", "FAKE_INSTRUCTIONS.md"), "utf8")).toStartWith("# Snerk\n");
  // The other permutation installs the other harness.
  expect(readFileSync(join(builds, "prerun-h56ea4852", "Dockerfile"), "utf8")).toContain(
    `RUN echo "install fake-harness-beta@1.0.0"\n`,
  );
});

test("build again: every image exists, so nothing is built", async () => {
  const docker = await fakeDocker([ALPHA, BETA]);
  const { stdout, exitCode, commands } = await build("two-pairs", docker);

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
  const { stdout, commands } = await build("two-pairs", docker);

  expect(stdout).toContain(`    ${ALPHA}  built (<t>s)\n`);
  expect(stdout).toContain(`    ${BETA}  reused\n`);
  expect(stdout).toEndWith("2 prerun images: 1 built, 1 reused\n");
  expect(commands.filter((c) => c.startsWith("docker build"))).toEqual([
    `docker build --tag ${ALPHA} $TMPDIR/thunderjar/builds/prerun-hefe85dda`,
  ]);

  const plan = await thunderjar(fixtures, ["plan", "two-pairs"], docker.env);
  expect(plan.stdout).toContain("    prerun-hefe85dda (exists, reused)\n");
  expect(plan.stdout).toContain("    prerun-h56ea4852 (exists, reused)\n");
});

test("a project outside any git repository builds: its parameters read no commits", async () => {
  const project = await copyOfFixtures(fixtures);
  const { stdout, stderr, exitCode } = await build("two-pairs", await fakeDocker(), project);

  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  expect(stdout).toEndWith("2 prerun images: 2 built, 0 reused\n");
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
Its build context is kept in $TMPDIR/thunderjar/builds/prerun-hefe85dda
`);
  expect(commands.filter((c) => c.startsWith("docker build"))).toHaveLength(1);
  expect(readdirSync(join(builds, "prerun-hefe85dda"))).toContain("Dockerfile");
});

test("build with no test case prints its usage", async () => {
  const { stderr, exitCode } = await thunderjar(fixtures, ["build"]);
  expect(exitCode).toBe(1);
  expect(stderr).toBe("usage: thunderjar build <test case>\n");
});
