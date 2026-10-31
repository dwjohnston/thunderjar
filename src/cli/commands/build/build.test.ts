// `thunderjar build`, through the CLI, in the checked-in fixtureTests/ scenarios, in place.
//
// - `--dry-run` prints each permutation's Dockerfile, so what each image is built from is
//   asserted on stdout, with nothing built. Any of these can be run by hand:
//
//     bun run fixture scenario_2 build two-pairs --dry-run
//
// - The rest stop before an image is made, against the recording fake Docker
//   (spec/120-test-boundaries.md#2-cli-with-recording-adapters): Docker can't be reached, a commit
//   is missing, the project isn't in a git repository, or a build fails, which no scenario's does.
//
// What a real build makes, and which images it reuses, is in build.docker.test.ts.

import { describe, expect, test } from "bun:test";
import { existsSync, listDir, makeTempDir } from "../../../platform/fs.ts";
import { dirname, join } from "../../../platform/path.ts";
import { fakeDocker, scenario, thunderjar } from "../../../testing/cli.ts";

type FakeDocker = Awaited<ReturnType<typeof fakeDocker>>;

/**
 * Runs `thunderjar build <testCase> <flags…>` in `project`, keeping build contexts under a fresh
 * $TMPDIR, with $TMPDIR replaced by a placeholder.
 */
async function cliBuild(
  project: string,
  testCase: string,
  { docker, flags = [], env = {} }: { docker?: FakeDocker; flags?: string[]; env?: Record<string, string> } = {},
) {
  docker ??= await fakeDocker();
  const tmpDir = await makeTempDir("thunderjar-fixture-tmp-");
  const result = await thunderjar(project, ["build", testCase, ...flags], { ...docker.env, TMPDIR: tmpDir, ...env });
  const normalise = (text: string) => text.replaceAll(tmpDir, "$TMPDIR");
  return {
    exitCode: result.exitCode,
    stdout: normalise(result.stdout),
    stderr: normalise(result.stderr),
    commands: docker.commands().map(normalise),
    builds: join(tmpDir, "thunderjar", "builds"),
  };
}

describe("scenario_1_minimal_initial_setup", () => {
  const fixtures = scenario("scenario_1_minimal_initial_setup");

  test("build example --dry-run: the Dockerfile copies the files beside the declarations", async () => {
    const { stdout, stderr, exitCode } = await cliBuild(fixtures, "example", { flags: ["--dry-run"] });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Dockerfiles for example (1 permutation). Nothing is built.

 1  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | plain
    thunderjar:prerun-h8ffdda6e

    FROM node:20-bookworm
    RUN echo "install fake-harness-alpha@1.0.0"
    WORKDIR /workspace
    COPY parameters/codeState/files/ /workspace/
    RUN npm ci
    COPY parameters/promptSet/FAKE_INSTRUCTIONS.md /workspace/FAKE_INSTRUCTIONS.md
`);
  });
});

describe("scenario_2_typical_project", () => {
  // Its parameters copy the files beside their declarations, so it builds in place, with no commits to read.
  const fixtures = scenario("scenario_2_typical_project");
  const ALPHA = "thunderjar:prerun-hefe85dda";
  const BETA = "thunderjar:prerun-h56ea4852";

  test("build two-pairs --dry-run: prints each permutation's Dockerfile, without Docker, and writes nothing", async () => {
    const { stdout, stderr, exitCode, commands, builds } = await cliBuild(fixtures, "two-pairs", {
      docker: await fakeDocker([], ["unreachable"]),
      flags: ["--dry-run"],
    });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    // The tags are those `thunderjar plan two-pairs` shows. Each fragment is in order, with
    // Thunderjar's WORKDIR before the code state: nothing else is Thunderjar's.
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
    const { stdout, commands } = await cliBuild(fixtures, "two-pairs", {
      docker: await fakeDocker([ALPHA, BETA]),
      flags: ["--dry-run"],
    });

    expect(stdout).toContain(`RUN echo "install fake-harness-alpha@1.0.0"\n`);
    expect(stdout).toContain(`RUN echo "install fake-harness-beta@1.0.0"\n`);
    expect(commands).toEqual([]);
  });

  test("--dry-run tags with --image-prefix", async () => {
    const { stdout } = await cliBuild(fixtures, "two-pairs", { flags: ["--dry-run", "--image-prefix", "throwaway"] });

    expect(stdout).toContain("    throwaway:prerun-hefe85dda\n");
    expect(stdout).toContain("    throwaway:prerun-h56ea4852\n");
  });

  test("without Docker, build stops before reading anything", async () => {
    const { stdout, stderr, exitCode, commands } = await cliBuild(fixtures, "two-pairs", {
      docker: await fakeDocker([], ["unreachable"]),
    });

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toBe(
      "error: Docker can't be reached (Cannot connect to the Docker daemon at unix:///var/run/docker.sock. " +
        "Is the docker daemon running?). Building prerun images needs Docker.\n",
    );
    expect(commands).toEqual(["docker version --format {{.Server.Version}}"]);
  });

  test("a failed build stops, and keeps its build context for inspection", async () => {
    const { stdout, stderr, exitCode, commands, builds } = await cliBuild(fixtures, "two-pairs", {
      docker: await fakeDocker([], ["fail-build"]),
    });

    expect(exitCode).toBe(1);
    expect(stdout).toEndWith(" 1  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | terse\n");
    expect(stderr).toBe(`fake docker: the build failed
error: building ${ALPHA} failed (docker build exited 1).
Its build context is kept in $TMPDIR/thunderjar/builds/prerun-hefe85dda
`);
    expect(commands.filter((c) => c.startsWith("docker build"))).toHaveLength(1);
    expect(listDir(join(builds, "prerun-hefe85dda"))).toContain("Dockerfile");
  });

  test("build with no test case, an unknown flag, or --image-prefix without a name, says what's wrong, then its usage", async () => {
    for (const [args, error] of [
      [["build"], "error: missing required argument 'test case'"],
      [["build", "two-pairs", "--dry"], "error: unknown option '--dry'"],
      [["build", "two-pairs", "--image-prefix"], "error: option '--image-prefix <name>' argument missing"],
      [["build", "--image-prefix", "two-pairs"], "error: missing required argument 'test case'"],
    ] as const) {
      const { stdout, stderr, exitCode } = await thunderjar(fixtures, [...args]);
      expect(stdout).toBe("");
      expect(stderr).toStartWith(error);
      expect(stderr).toContain("Usage: thunderjar build [options] <test case>");
      expect(exitCode).toBe(1);
    }
  });
});

describe("scenario_4_git_project", () => {
  // Its code states and prompt sets read two real commits of this repository, the ones that added
  // and changed fixtures/project/ (tags fixture-scenario-4-first and fixture-scenario-4-second).
  const fixtures = scenario("scenario_4_git_project");
  const FIRST = "523984c7fd72f047265ab89ce5901605af6acb2b";
  const SECOND = "952687db16b373d58f79f46690f9c5b0aa1aa141";
  const PROJECT = "fixtureTests/scenario_4_git_project/fixtures/project";

  test("build two-commits --dry-run: each code state checks out its own commit, each prompt set copies its file at its own", async () => {
    const { stdout, stderr, exitCode, commands } = await cliBuild(fixtures, "two-commits", { flags: ["--dry-run"] });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(commands).toEqual([]);
    const permutation = (row: string, tag: string, commit: string, promptCommit: string) => `
${row} | fake-harness-alpha@1.0.0/fake-model-small | plain
    thunderjar:${tag}

    FROM node:20-bookworm
    RUN echo "install fake-harness-alpha@1.0.0"
    WORKDIR /workspace
    COPY git/${commit}.bundle /tmp/code.bundle
    RUN git clone --quiet /tmp/code.bundle /workspace \\
      && git -C /workspace checkout --quiet --detach ${commit} \\
      && git -C /workspace branch --quiet --delete --force code-state \\
      && git -C /workspace remote remove origin \\
      && git -C /workspace config user.name "Thunderjar agent" \\
      && git -C /workspace config user.email agent@thunderjar.invalid \\
      && rm /tmp/code.bundle
    RUN cd ${PROJECT} && npm ci
    COPY git/${promptCommit}/${PROJECT}/prompts/house-style.md /workspace/HOUSE_STYLE.md
`;
    expect(stdout).toBe(
      "Dockerfiles for two-commits (4 permutations). Nothing is built.\n" +
        permutation(" 1  node20 | first  | house-style-first ", "prerun-hf803f77d", FIRST, FIRST) +
        permutation(" 2  node20 | first  | house-style-second", "prerun-h85c50e99", FIRST, SECOND) +
        permutation(" 3  node20 | second | house-style-first ", "prerun-hc7fcb855", SECOND, FIRST) +
        permutation(" 4  node20 | second | house-style-second", "prerun-h51cb391f", SECOND, SECOND),
    );
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

  test("a project whose parameters read commits must be in a git repository", async () => {
    // Git doesn't look above the scenario's folder, so finds no repository for fixtures/.
    const { stdout, stderr, exitCode, commands } = await cliBuild(fixtures, "two-commits", {
      env: { GIT_CEILING_DIRECTORIES: dirname(fixtures) },
    });

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toBe(`error: ${fixtures} is not in a git repository, but code state "first" reads commit ${FIRST} from it.\n`);
    expect(commands.filter((c) => c.startsWith("docker build"))).toEqual([]);
  });
});
