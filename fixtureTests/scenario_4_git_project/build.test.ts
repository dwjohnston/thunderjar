// `thunderjar build` in a project whose code states and prompt sets are real git: they read
// two real commits of this repository, the ones that added and changed fixtures/project/
// (tags fixture-scenario-4-first and fixture-scenario-4-second). Against the recording fake
// Docker; by hand, against real Docker:
//
//   bun run fixture scenario_4 build two-commits

import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fakeDocker, scenarioFixtures, thunderjar } from "../helpers.ts";

const fixtures = scenarioFixtures(import.meta.dir);

const FIRST = "65bcb92cc069821e4695433b11582962ee6d68bd";
const SECOND = "5f52f9e08051a67c5ca0d630e2ce586a62819778";
const PROJECT = "fixtureTests/scenario_4_git_project/fixtures/project";

/** Builds in place, keeping build contexts under a fresh $TMPDIR. */
async function build(testCase: string) {
  const docker = await fakeDocker();
  const tmpDir = await mkdtemp(join(tmpdir(), "thunderjar-fixture-tmp-"));
  const result = await thunderjar(fixtures, ["build", testCase], { ...docker.env, TMPDIR: tmpDir });
  const builds = join(tmpDir, "thunderjar", "builds");
  /** The build context of the permutation printed on the line before `<tag>  built`. */
  const contextOf = (row: string) => {
    const tag = new RegExp(`${row.replaceAll("|", "\\|")}\\n {4}thunderjar:(prerun-h[0-9a-f]{8})  built`).exec(result.stdout)![1]!;
    return join(builds, tag);
  };
  return { ...result, commands: docker.commands(), contextOf };
}

const git = (cwd: string, ...args: string[]) => spawnSync("git", args, { cwd, encoding: "utf8" }).stdout.trim();

test("build two-commits: each code state's bundle and prompt set's file come from its own commit", async () => {
  const { stdout, stderr, exitCode, contextOf } = await build("two-commits");

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
  const { contextOf } = await build("two-commits");
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
  const { contextOf } = await build("two-commits");
  const clone = join(await mkdtemp(join(tmpdir(), "thunderjar-clone-")), "clone");
  const bundle = join(contextOf(" 1  node20 | first  | house-style-first  | fake-harness-alpha@1.0.0/fake-model-small | plain"), "git", `${FIRST}.bundle`);
  spawnSync("git", ["clone", "--quiet", bundle, clone]);

  expect(git(clone, "rev-parse", "HEAD")).toBe(FIRST);
  const history = git(clone, "log", "--all", "--format=%H").split("\n");
  expect(history).not.toContain(SECOND);
  expect(readdirSync(join(clone, PROJECT)).toSorted()).toEqual(["greet.js", "package-lock.json", "package.json", "prompts"]);
});

test("a commit that isn't in this repository stops the build before anything is built", async () => {
  const { stdout, stderr, exitCode, commands } = await build("unpushed-commit");

  expect(exitCode).toBe(1);
  expect(stdout).toBe("");
  expect(stderr).toBe(`error: commit a1b2c3 (code state "unpushed") is not in this repository.
Fetch it, or check that it has been pushed.
`);
  expect(commands.filter((c) => c.startsWith("docker build"))).toEqual([]);
});
