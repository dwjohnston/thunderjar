// `thunderjar build`, in two halves:
//
// - Through the CLI, in the checked-in fixtureTests/ scenarios, against the recording fake Docker
//   (spec/120-test-boundaries.md#2-cli-with-recording-adapters): what is printed, which Docker
//   commands are issued, and what lands in each build context. Any of these can be run by hand,
//   against real Docker:
//
//     bun run fixture scenario_2 build two-pairs
//
// - Calling build() on a throwaway project that is also the seed repository
//   (src/testing/seed-repo.ts), for what no checked-in scenario can be, such as a project
//   outside any git repository whose parameters read commits.

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyOfFixtures, fakeDocker, scenario, thunderjar } from "../../testing/cli.ts";
import { memoryDocker } from "../../testing/fake-docker.ts";
import { createFixtureProject, gitParameters, linkThunderjar } from "../../testing/fixture-project.ts";
import { SEED_COMMITS, seedRepo } from "../../testing/seed-repo.ts";
import { build } from "./build.ts";

const tmp = () => mkdtemp(join(tmpdir(), "thunderjar-build-"));

type FakeDocker = Awaited<ReturnType<typeof fakeDocker>>;

/**
 * Runs `thunderjar build <testCase> <flags…>` in `project`, keeping build contexts under a fresh $TMPDIR,
 * with $TMPDIR and durations replaced by placeholders.
 */
async function cliBuild(project: string, testCase: string, docker?: FakeDocker, flags: string[] = []) {
  docker ??= await fakeDocker();
  const tmpDir = await mkdtemp(join(tmpdir(), "thunderjar-fixture-tmp-"));
  const result = await thunderjar(project, ["build", testCase, ...flags], { ...docker.env, TMPDIR: tmpDir });
  const normalise = (text: string) => text.replaceAll(tmpDir, "$TMPDIR").replace(/ built \(\d+\.\d\ds\)$/gm, " built (<t>s)");
  const stdout = normalise(result.stdout);
  const builds = join(tmpDir, "thunderjar", "builds");
  /** The build context of the permutation printed on the line before `<tag>  built`. */
  const contextOf = (row: string) => {
    const tag = new RegExp(`${row.replaceAll("|", "\\|")}\\n {4}thunderjar:(prerun-h[0-9a-f]{8})  built`).exec(stdout)![1]!;
    return join(builds, tag);
  };
  return {
    exitCode: result.exitCode,
    stdout,
    stderr: normalise(result.stderr),
    commands: docker.commands().map(normalise),
    builds,
    contextOf,
  };
}

describe("scenario_1_minimal_initial_setup", () => {
  const fixtures = scenario("scenario_1_minimal_initial_setup");

  test("build example: builds the prerun image from the files beside the declarations", async () => {
    const { stdout, stderr, exitCode, builds } = await cliBuild(fixtures, "example");

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toEndWith("1 prerun image: 1 built, 0 reused\n");
    const [context] = readdirSync(builds);
    expect(readdirSync(join(builds, context!), { recursive: true }).map(String)).toContain(
      join("parameters", "codeState", "files", "package.json"),
    );
  });
});

describe("scenario_2_typical_project", () => {
  // Its parameters copy the files beside their declarations, so it builds in place, with no commits to read.
  const fixtures = scenario("scenario_2_typical_project");
  const ALPHA = "thunderjar:prerun-hefe85dda";
  const BETA = "thunderjar:prerun-h56ea4852";

  test("build two-pairs: builds each missing prerun image, and stops", async () => {
    const { stdout, stderr, exitCode, commands } = await cliBuild(fixtures, "two-pairs");

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
    const { builds } = await cliBuild(fixtures, "two-pairs");

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
    const { stdout, exitCode, commands } = await cliBuild(fixtures, "two-pairs", await fakeDocker([ALPHA, BETA]));

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
    const { stdout, commands } = await cliBuild(fixtures, "two-pairs", docker);

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
    const { stdout, stderr, exitCode } = await cliBuild(await copyOfFixtures(fixtures), "two-pairs");

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toEndWith("2 prerun images: 2 built, 0 reused\n");
  });

  test("build two-pairs --dry-run: prints each permutation's Dockerfile, without Docker, and writes nothing", async () => {
    const { stdout, stderr, exitCode, commands, builds } = await cliBuild(
      fixtures,
      "two-pairs",
      await fakeDocker([], ["unreachable"]),
      ["--dry-run"],
    );

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Dockerfiles for two-pairs (2 permutations). Nothing is built.

 1  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | terse
    ${ALPHA}

    FROM node:20-bookworm
    RUN echo "install fake-harness-alpha@1.0.0"
    WORKDIR /workspace
    COPY parameters/codeState/files/ /workspace/
    RUN npm ci
    COPY parameters/promptSet/FAKE_INSTRUCTIONS.md /workspace/FAKE_INSTRUCTIONS.md

 2  node20 | baseline | snerk | fake-harness-beta@1.0.0/fake-model-large  | terse
    ${BETA}

    FROM node:20-bookworm
    RUN echo "install fake-harness-beta@1.0.0"
    WORKDIR /workspace
    COPY parameters/codeState/files/ /workspace/
    RUN npm ci
    COPY parameters/promptSet/FAKE_INSTRUCTIONS.md /workspace/FAKE_INSTRUCTIONS.md
`);
    expect(commands).toEqual([]);
    expect(existsSync(builds)).toBe(false);
  });

  test("--dry-run prints every permutation's Dockerfile, even when its image exists", async () => {
    const { stdout, commands } = await cliBuild(fixtures, "two-pairs", await fakeDocker([ALPHA, BETA]), ["--dry-run"]);

    expect(stdout).toContain(`RUN echo "install fake-harness-alpha@1.0.0"\n`);
    expect(stdout).toContain(`RUN echo "install fake-harness-beta@1.0.0"\n`);
    expect(commands).toEqual([]);
  });

  test("--dry-run tags with --image-prefix", async () => {
    const { stdout } = await cliBuild(fixtures, "two-pairs", undefined, ["--dry-run", "--image-prefix", "throwaway"]);

    expect(stdout).toContain("    throwaway:prerun-hefe85dda\n");
    expect(stdout).toContain("    throwaway:prerun-h56ea4852\n");
  });

  test("without Docker, build stops before reading anything", async () => {
    const { stdout, stderr, exitCode, commands } = await cliBuild(fixtures, "two-pairs", await fakeDocker([], ["unreachable"]));

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toBe(
      "error: Docker can't be reached (Cannot connect to the Docker daemon at unix:///var/run/docker.sock. " +
        "Is the docker daemon running?). Building prerun images needs Docker.\n",
    );
    expect(commands).toEqual(["docker version --format {{.Server.Version}}"]);
  });

  test("a failed build stops, and keeps its build context for inspection", async () => {
    const { stdout, stderr, exitCode, commands, builds } = await cliBuild(fixtures, "two-pairs", await fakeDocker([], ["fail-build"]));

    expect(exitCode).toBe(1);
    expect(stdout).toEndWith(" 1  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | terse\n");
    expect(stderr).toBe(`fake docker: the build failed
error: building ${ALPHA} failed (docker build exited 1).
Its build context is kept in $TMPDIR/thunderjar/builds/prerun-hefe85dda
`);
    expect(commands.filter((c) => c.startsWith("docker build"))).toHaveLength(1);
    expect(readdirSync(join(builds, "prerun-hefe85dda"))).toContain("Dockerfile");
  });

  test("build --image-prefix: looks up and tags each prerun image under the prefix", async () => {
    const docker = await fakeDocker(["throwaway:prerun-h56ea4852"]);
    const { stdout, stderr, exitCode, commands } = await cliBuild(fixtures, "two-pairs", docker, ["--image-prefix", "throwaway"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("    throwaway:prerun-hefe85dda  built (<t>s)\n");
    expect(stdout).toContain("    throwaway:prerun-h56ea4852  reused\n");
    expect(commands).toEqual([
      "docker version --format {{.Server.Version}}",
      "docker image inspect --format {{.Id}} throwaway:prerun-hefe85dda",
      "docker image inspect --format {{.Id}} throwaway:prerun-h56ea4852",
      "docker build --tag throwaway:prerun-hefe85dda $TMPDIR/thunderjar/builds/prerun-hefe85dda",
    ]);
  });

  test("build with no test case, an unknown flag, or --image-prefix without a name, prints its usage", async () => {
    for (const args of [
      ["build"],
      ["build", "two-pairs", "--dry"],
      ["build", "two-pairs", "--image-prefix"],
      ["build", "--image-prefix", "two-pairs"],
    ]) {
      const { stderr, exitCode } = await thunderjar(fixtures, args);
      expect(stderr).toBe("usage: thunderjar build <test case> [--dry-run] [--image-prefix <name>]\n");
      expect(exitCode).toBe(1);
    }
  });
});

describe("scenario_4_git_project", () => {
  // Its code states and prompt sets read two real commits of this repository, the ones that added
  // and changed fixtures/project/ (tags fixture-scenario-4-first and fixture-scenario-4-second).
  const fixtures = scenario("scenario_4_git_project");
  const FIRST = "65bcb92cc069821e4695433b11582962ee6d68bd";
  const SECOND = "5f52f9e08051a67c5ca0d630e2ce586a62819778";
  const PROJECT = "fixtureTests/scenario_4_git_project/fixtures/project";

  const git = (cwd: string, ...args: string[]) => spawnSync("git", args, { cwd, encoding: "utf8" }).stdout.trim();

  test("build two-commits: each code state's bundle and prompt set's file come from its own commit", async () => {
    const { stdout, stderr, exitCode, contextOf } = await cliBuild(fixtures, "two-commits");

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toEndWith("4 prerun images: 4 built, 0 reused\n");

    const context = contextOf(" 3  node20 | second | house-style-first  | fake-harness-alpha@1.0.0/fake-model-small | plain");
    expect(readdirSync(join(context, "git"))).toContain(`${SECOND}.bundle`);
    const dockerfile = readFileSync(join(context, "Dockerfile"), "utf8");
    expect(dockerfile).toContain(`WORKDIR /workspace
COPY git/${SECOND}.bundle /tmp/code.bundle
RUN git clone --quiet /tmp/code.bundle /workspace \\
  && git -C /workspace checkout --quiet --detach ${SECOND} \\`);
    expect(dockerfile).toContain(`\nRUN cd ${PROJECT} && npm ci\n`);
    expect(dockerfile).toEndWith(`\nCOPY git/${FIRST}/${PROJECT}/prompts/house-style.md /workspace/HOUSE_STYLE.md\n`);
  });

  test("a prompt file is read at its prompt set's commit, never from the worktree", async () => {
    const { contextOf } = await cliBuild(fixtures, "two-commits");
    const promptFile = (row: string, commit: string) =>
      readFileSync(join(contextOf(row), "git", commit, PROJECT, "prompts", "house-style.md"), "utf8");

    expect(promptFile(" 1  node20 | first  | house-style-first  | fake-harness-alpha@1.0.0/fake-model-small | plain", FIRST)).toStartWith(
      "# House style (first commit)\n",
    );
    expect(
      promptFile(" 2  node20 | first  | house-style-second | fake-harness-alpha@1.0.0/fake-model-small | plain", SECOND),
    ).toStartWith("# House style (second commit)\n");
    // The worktree's copy has moved on from both.
    expect(readFileSync(join(fixtures, "project", "prompts", "house-style.md"), "utf8")).toStartWith("# House style (worktree");
  });

  test("a code state's bundle holds its commit and what came before it, and nothing after", async () => {
    const { contextOf } = await cliBuild(fixtures, "two-commits");
    const clone = join(await tmp(), "clone");
    const bundle = join(contextOf(" 1  node20 | first  | house-style-first  | fake-harness-alpha@1.0.0/fake-model-small | plain"), "git", `${FIRST}.bundle`);
    spawnSync("git", ["clone", "--quiet", bundle, clone]);

    expect(git(clone, "rev-parse", "HEAD")).toBe(FIRST);
    const history = git(clone, "log", "--all", "--format=%H").split("\n");
    expect(history).not.toContain(SECOND);
    expect(readdirSync(join(clone, PROJECT)).toSorted()).toEqual(["greet.js", "package-lock.json", "package.json", "prompts"]);
  });

  test("a commit that isn't in this repository stops the build before anything is built", async () => {
    const { stdout, stderr, exitCode, commands } = await cliBuild(fixtures, "unpushed-commit");

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toBe(`error: commit a1b2c3 (code state "unpushed") is not in this repository.
Fetch it, or check that it has been pushed.
`);
    expect(commands.filter((c) => c.startsWith("docker build"))).toEqual([]);
  });
});

describe("the seed repository", () => {
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
});
