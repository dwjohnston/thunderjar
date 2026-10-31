// Docker image tests for `build` — spec/120-test-boundaries.md#31-generating-the-pre-run-image.
// Docker and the images are real; the agent is the fake one. Skipped by `bun test`; run with
// `bun run test:prepare && bun run test:docker`. Each run passes a throwaway `--image-prefix`
// and removes every image under it afterwards.
//
// Each runs the CLI in place in a checked-in scenario, as by hand:
//
//     bun run fixture scenario_4 build two-commits

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { makeTempDir, readTextSync } from "../../../platform/fs.ts";
import { dirname, join } from "../../../platform/path.ts";
import { dockerCli } from "../../../adapters/docker/docker.ts";
import { scenario, thunderjar } from "../../../testing/cli.ts";

const BASE_IMAGE = `node:20-bookworm`;
const docker = dockerCli("docker");
const prefix = `thunderjar-test-${process.pid}-${Date.now()}`;

/**
 * Runs `thunderjar <command> <testCase> --image-prefix <prefix>` in `project` against real Docker,
 * with build contexts under a fresh $TMPDIR, and durations replaced by a placeholder.
 */
async function cli(project: string, command: string, testCase: string, env: Record<string, string> = {}) {
  const tmpDir = await makeTempDir("thunderjar-build-docker-");
  const result = await thunderjar(project, [command, testCase, "--image-prefix", prefix], {
    THUNDERJAR_DOCKER: "docker",
    TMPDIR: tmpDir,
    ...env,
  });
  const normalise = (text: string) =>
    text.replaceAll(tmpDir, "$TMPDIR").replaceAll(prefix, "<prefix>").replace(/ built \(\d+\.\d\ds\)$/gm, " built (<t>s)");
  return { ...result, stdout: normalise(result.stdout), stderr: normalise(result.stderr) };
}

/** Runs `script` with sh in a throwaway container from `ref`. */
function inImage(ref: string, script: string) {
  const result = Bun.spawnSync(["docker", "run", "--rm", ref, "sh", "-c", script], { stdout: "pipe", stderr: "pipe" });
  expect(result.stderr.toString()).toBe("");
  return result.stdout.toString().trim();
}

const prefixed = (tag: string) => `${prefix}:${tag}`;

describe.skipIf(!process.env.THUNDERJAR_TEST_DOCKER)("build, against real Docker", () => {
  beforeAll(async () => {
    const unreachable = await docker.unreachable();
    if (unreachable) throw new Error(`Docker can't be reached (${unreachable}).`);
    if (!(await docker.imageExists(BASE_IMAGE))) {
      throw new Error(`The fixture image ${BASE_IMAGE} is missing. Run \`bun run test:prepare\` first.`);
    }
  });

  afterAll(() => {
    const images = Bun.spawnSync(["docker", "image", "ls", "--format", "{{.Repository}}:{{.Tag}}", prefix], { stdout: "pipe" })
      .stdout.toString()
      .split("\n")
      .filter(Boolean);
    if (images.length > 0) Bun.spawnSync(["docker", "image", "rm", "--force", ...images]);
  });

  describe("scenario_1_minimal_initial_setup", () => {
    const fixtures = scenario("scenario_1_minimal_initial_setup");
    const REF = prefixed("prerun-h8ffdda6e");

    test("build example: /workspace holds the code state's and prompt set's files, and node; a second build reuses it", async () => {
      // Outside any git repository, too: its parameters read no commits.
      const built = await cli(fixtures, "build", "example", { GIT_CEILING_DIRECTORIES: dirname(fixtures) });

      expect(built.exitCode).toBe(0);
      expect(built.stdout).toBe(`Building 1 prerun image for example (1 permutation)
Build contexts in $TMPDIR/thunderjar/builds

 1  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | plain
    <prefix>:prerun-h8ffdda6e  built (<t>s)

1 prerun image: 1 built, 0 reused
`);
      expect(inImage(REF, "pwd && ls -A")).toBe("/workspace\nFAKE_INSTRUCTIONS.md\npackage-lock.json\npackage.json");
      expect(inImage(REF, "head -1 FAKE_INSTRUCTIONS.md")).toBe("# Snerk");
      expect(inImage(REF, "node --version")).toStartWith("v20.");

      const again = await cli(fixtures, "build", "example");
      expect(again.stdout).toBe(`Every prerun image for example exists (1 permutation)

 1  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | plain
    <prefix>:prerun-h8ffdda6e  reused

1 prerun image: 0 built, 1 reused
`);
    }, 300_000);
  });

  describe("scenario_2_typical_project", () => {
    const fixtures = scenario("scenario_2_typical_project");
    const ALPHA = prefixed("prerun-hefe85dda");

    test("build two-pairs: builds each missing prerun image; with one removed, builds only that one, and plan shows both reused", async () => {
      const built = await cli(fixtures, "build", "two-pairs");

      expect(built.exitCode).toBe(0);
      // The tags are those `thunderjar plan two-pairs` shows.
      expect(built.stdout).toBe(`Building 2 prerun images for two-pairs (2 permutations)
Build contexts in $TMPDIR/thunderjar/builds

 1  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | terse
    <prefix>:prerun-hefe85dda  built (<t>s)

 2  node20 | baseline | snerk | fake-harness-beta@1.0.0/fake-model-large  | terse
    <prefix>:prerun-h56ea4852  built (<t>s)

2 prerun images: 2 built, 0 reused
`);

      Bun.spawnSync(["docker", "image", "rm", "--force", ALPHA]);
      const again = await cli(fixtures, "build", "two-pairs");
      expect(again.stdout).toContain("    <prefix>:prerun-hefe85dda  built (<t>s)\n");
      expect(again.stdout).toContain("    <prefix>:prerun-h56ea4852  reused\n");
      expect(again.stdout).toEndWith("2 prerun images: 1 built, 1 reused\n");

      const plan = await cli(fixtures, "plan", "two-pairs");
      expect(plan.stdout).toContain("    prerun-hefe85dda (exists, reused)\n");
      expect(plan.stdout).toContain("    prerun-h56ea4852 (exists, reused)\n");
    }, 300_000);
  });

  // Scenario 4's parameters read real commits of this repository, so its images show what only
  // the copied files can: a prompt file read at its commit, and a bundle with nothing after its commit.
  describe("scenario_4_git_project", () => {
    const fixtures = scenario("scenario_4_git_project");
    const FIRST = "523984c7fd72f047265ab89ce5901605af6acb2b";
    const SECOND = "952687db16b373d58f79f46690f9c5b0aa1aa141";
    const PROJECT = "fixtureTests/scenario_4_git_project/fixtures/project";
    const refs = new Map<string, string>();

    beforeAll(async () => {
      const { stdout, exitCode } = await cli(fixtures, "build", "two-commits");
      expect(exitCode).toBe(0);
      expect(stdout).toEndWith("4 prerun images: 4 built, 0 reused\n");
      // Each permutation's row, by code state and prompt set, and the image it built.
      for (const [, codeState, promptSet, tag] of stdout.matchAll(/\| (\w+) +\| ([\w-]+) +\|.*\n {4}<prefix>:(\S+) {2}built/g)) {
        refs.set(`${codeState}/${promptSet}`, prefixed(tag!));
      }
      expect(refs.size).toBe(4);
    }, 300_000);

    test("the first code state: this repository at the first commit, detached, with nothing after it", () => {
      const ref = refs.get("first/house-style-second")!;
      expect(inImage(ref, "pwd && git rev-parse HEAD && git rev-parse --abbrev-ref HEAD")).toBe(`/workspace\n${FIRST}\nHEAD`);
      expect(inImage(ref, "git remote && git for-each-ref refs/heads")).toBe("");
      expect(inImage(ref, `git log --all --format=%H | grep -c ${SECOND} || true`)).toBe("0");
      expect(inImage(ref, `ls ${PROJECT}`)).toBe("greet.js\npackage-lock.json\npackage.json\nprompts");
      // A git identity for the agent.
      expect(inImage(ref, "git config user.email")).toBe("agent@thunderjar.invalid");
    });

    test("the second code state: the second commit, with the file it added", () => {
      const ref = refs.get("second/house-style-first")!;
      expect(inImage(ref, "git rev-parse HEAD")).toBe(SECOND);
      expect(inImage(ref, `ls ${PROJECT}/farewell.js && cat ${PROJECT}/greet.js | tail -1`)).toBe(
        `${PROJECT}/farewell.js\nexport const greet = (name) => \`Hello, \${name}!\`;`,
      );
    });

    test("a prompt file is read at its prompt set's commit, never from the worktree", () => {
      // The prompt set's commit, whichever the code state's is.
      expect(inImage(refs.get("first/house-style-second")!, "head -1 HOUSE_STYLE.md")).toBe("# House style (second commit)");
      expect(inImage(refs.get("second/house-style-first")!, "head -1 HOUSE_STYLE.md")).toBe("# House style (first commit)");
      // The worktree's copy has moved on from both.
      expect(readTextSync(join(fixtures, "project", "prompts", "house-style.md"))).toStartWith("# House style (worktree");
    });
  });
});
