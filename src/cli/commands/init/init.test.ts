// `thunderjar init`, through the CLI, on a copy of an uninitialised scenario, because it writes into the project.
import { describe, expect, test } from "bun:test";
import { $, Glob } from "bun";
import { copyScenarioProject, TMP_DIR, thunderjar } from "../../../testing/cli.ts";
import { REPO_ROOT, scenario } from "../../../testing/scenario.ts";

/** Every file under `.thunderjar/` in `dir`, sorted. */
const filesIn = (dir: string) =>
  [...new Glob("**/*").scanSync({ cwd: `${dir}/.thunderjar`, dot: true })].toSorted();

const read = (dir: string, path: string) => Bun.file(`${dir}/.thunderjar/${path}`).text();

const P = "test-case-parameters";

/**
 * `thunderjar init` in `dir`. Scenario copies are inside this repository, so git stops looking at
 * fixtures/.tmp/: a copy is a git repository only if it has its own .git.
 */
const init = (dir: string) => thunderjar(dir, ["init"], { env: { GIT_CEILING_DIRECTORIES: TMP_DIR } });

const HARNESS_FILES = ["index.ts", "models.ts", "versions.ts", "collectTokenCosts.ts"];
const HARNESSES = ["claude-code", "copilot", "codex", "opencode"];

/** What `init` scaffolds in any project, in the order it prints them, after the nested package.json. */
const SCAFFOLD = [
  "tsconfig.json",
  ".gitignore",
  "thunderjar.config.ts",
  "test-cases/compare-models.ts",
  "test-cases/compare-harnesses.ts",
  `${P}/baseImages/node20/index.ts`,
  `${P}/codeStates/baseline/index.ts`,
  `${P}/promptSets/snerk/index.ts`,
  `${P}/promptSets/house-style/index.ts`,
  `${P}/promptSets/house-style/files/AGENTS.md`,
  ...HARNESSES.flatMap((harness) => HARNESS_FILES.map((file) => `${P}/harnessModels/${harness}/${file}`)),
  `${P}/tasks/is-prime/initial-prompts/plain.ts`,
  `${P}/tasks/is-prime/measurements/isPrimeTsExists.ts`,
  `${P}/tasks/is-prime/measurements/isPrimeTemplateTest.ts`,
  `${P}/tasks/is-prime/measurements/templates/isPrime.test.ts.template`,
  `${P}/tasks/is-prime/measurements/tsIgnoreCount.ts`,
];

const createdLines = (paths: string[]) =>
  ["Created .thunderjar/", ...paths.map((path) => `Created .thunderjar/${path}`)].join("\n") + "\n";

describe("0101 empty project", () => {
  test("scaffolds .thunderjar/, with a nested package.json and its node_modules ignored", async () => {
    await using copy = await copyScenarioProject("0101");

    const { stdout, stderr, exitCode } = await init(copy.dir);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const created = ["package.json", ...SCAFFOLD];
    expect(stdout).toBe(createdLines(created));
    expect(filesIn(copy.dir)).toEqual(created.toSorted());
    expect(JSON.parse(await read(copy.dir, "package.json"))).toEqual({
      name: "thunderjar-config",
      private: true,
      type: "module",
      dependencies: { thunderjar: "latest" },
    });
    expect(await read(copy.dir, ".gitignore")).toBe("_generated/\n.data/\nnode_modules/\n");
    expect(await read(copy.dir, "thunderjar.config.ts")).toBe(`import { declareConfig, sqliteStore } from "thunderjar";

export default declareConfig({
  imageStore: { repository: "ghcr.io/your-org/thunderjar-images" },
  runDataStore: sqliteStore({ path: "./.thunderjar/.data/runs.sqlite" }),
});
`);
    expect(await read(copy.dir, "test-cases/compare-models.ts")).toBe(`import { declareTestCase } from "thunderjar";

// The same harness on two models: Claude Code on Haiku 4.5, and on Haiku 5.5.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["claude-code@2.1.283/haiku-4-5", "claude-code@2.1.283/haiku-5-5"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 1,
});
`);
    expect(await read(copy.dir, "test-cases/compare-harnesses.ts")).toBe(`import { declareTestCase } from "thunderjar";

// The same model in three harnesses: Haiku 5.5 in Claude Code, GitHub Copilot CLI and OpenCode.
// Each harness needs its own key: ANTHROPIC_API_KEY, COPILOT_GITHUB_TOKEN and OPENCODE_API_KEY.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["claude-code@2.1.283/haiku-5-5", "copilot@1.0.105/haiku-5-5", "opencode@1.19.5/haiku-5-5"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 1,
});
`);
  });

  test("outside a git repository, its code state leaves /workspace empty, and says how to check a commit out", async () => {
    await using copy = await copyScenarioProject("0101");
    await init(copy.dir);

    const baseline = await read(copy.dir, `${P}/codeStates/baseline/index.ts`);
    expect(baseline).toContain("export default declareCodeState({});");
    expect(baseline).toContain("//     applyParameter: (config, ctx) => checkoutCommit(ctx, config.commit),");
    expect(await read(copy.dir, `${P}/promptSets/snerk/index.ts`)).toContain('commit: "<a commit hash>"');
  });

  test("every TypeScript file it scaffolds imports thunderjar and loads", async () => {
    await using copy = await copyScenarioProject("0101");
    await init(copy.dir);

    const files = filesIn(copy.dir).filter((path) => path.endsWith(".ts"));
    expect(files).toHaveLength(SCAFFOLD.filter((path) => path.endsWith(".ts")).length);
    for (const path of files) {
      const module = await import(`${copy.dir}/.thunderjar/${path}`);
      expect(module.default).toBeDefined();
    }
  });

  test("what it scaffolds type-checks with its own tsconfig.json", async () => {
    await using copy = await copyScenarioProject("0101");
    await init(copy.dir);

    const result = await $`${REPO_ROOT}/node_modules/.bin/tsc --noEmit -p ${copy.dir}/.thunderjar/tsconfig.json`
      .quiet()
      .nothrow();

    expect(result.stdout.toString() + result.stderr.toString()).toBe("");
    expect(result.exitCode).toBe(0);
  }, 30_000);

  test("run again, it creates only what's missing and leaves the rest as it was", async () => {
    await using copy = await copyScenarioProject("0101");
    await init(copy.dir);
    await Bun.write(`${copy.dir}/.thunderjar/thunderjar.config.ts`, "// edited\n");
    await $`rm ${copy.dir}/.thunderjar/test-cases/compare-models.ts`.quiet();

    const { stdout, stderr, exitCode } = await init(copy.dir);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(
      [
        "Created .thunderjar/test-cases/compare-models.ts",
        ...["package.json", ...SCAFFOLD]
          .filter((path) => path !== "test-cases/compare-models.ts")
          .map((path) => `Exists  .thunderjar/${path}`),
      ].join("\n") + "\n",
    );
    expect(await read(copy.dir, "thunderjar.config.ts")).toBe("// edited\n");
  });
});

describe("0102 JavaScript project", () => {
  test("a project with its own package.json gets no nested one", async () => {
    await using copy = await copyScenarioProject("0102");
    const rootPackage = await Bun.file(`${copy.dir}/package.json`).text();

    const { stdout, stderr, exitCode } = await init(copy.dir);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(createdLines(SCAFFOLD));
    expect(filesIn(copy.dir)).toEqual(SCAFFOLD.toSorted());
    expect(await read(copy.dir, ".gitignore")).toBe("_generated/\n.data/\n");
    expect(await Bun.file(`${copy.dir}/package.json`).text()).toBe(rootPackage);
  });
});

describe("0101 empty project, made a git repository", () => {
  test("its code state checks out the project's commit, and its prompt set copies files from it", async () => {
    await using copy = await copyScenarioProject("0101");
    const git = (args: string[]) => $`git ${args}`.cwd(copy.dir).env({ ...Bun.env, GIT_CEILING_DIRECTORIES: TMP_DIR }).quiet();
    await git(["init", "--quiet"]);
    await git(["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--quiet", "--allow-empty", "-m", "first"]);
    const head = (await git(["rev-parse", "HEAD"])).stdout.toString().trim();

    const { stderr, exitCode } = await init(copy.dir);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(await read(copy.dir, `${P}/codeStates/baseline/index.ts`)).toBe(`import { checkoutCommit, declareCodeState } from "thunderjar";

// The project's repository at a commit, checked out into /workspace. The commit must be in the
// repository: commit it, or Thunderjar can't build it.
export default declareCodeState({
  config: { commit: "${head}" },
  applyParameter: (config, ctx) => checkoutCommit(ctx, config.commit),
});
`);
    expect(await read(copy.dir, `${P}/promptSets/snerk/index.ts`)).toContain(`commit: "${head}"`);
  });

  test("before its first commit, it's treated as outside one", async () => {
    await using copy = await copyScenarioProject("0101");
    await $`git init --quiet`.cwd(copy.dir).quiet();

    const { exitCode } = await init(copy.dir);

    expect(exitCode).toBe(0);
    expect(await read(copy.dir, `${P}/codeStates/baseline/index.ts`)).toContain("export default declareCodeState({});");
  });
});

describe("0201 minimal existing setup", () => {
  const ALPHA = `${P}/harnessModels/fake-harness-alpha/`;
  const CLAUDE_CODE = `${P}/harnessModels/claude-code/`;
  const GENERATED = "_generated/parameterNames.d.ts";
  // What a minimal setup leaves out: every harness but Claude Code, the second prompt set, and init's
  // test cases, which use real harnesses. 0201 has one test case of its own, `example`, instead.
  const leftOut = (path: string) =>
    (path.startsWith(`${P}/harnessModels/`) && !path.startsWith(CLAUDE_CODE)) ||
    path.startsWith(`${P}/promptSets/house-style/`) ||
    path.startsWith("test-cases/");

  test("is what init scaffolds in 0101, with the agent swapped for fake-harness-alpha, no starters, and its own test case", async () => {
    await using copy = await copyScenarioProject("0101");
    await init(copy.dir);
    const scaffolded = filesIn(copy.dir).filter((path) => !leftOut(path));
    const existing = filesIn(scenario("0201"));

    const swapped = (path: string) => path.replace(CLAUDE_CODE, ALPHA);
    expect(existing).toEqual([...scaffolded.map(swapped), "test-cases/example.ts", GENERATED].toSorted());
    for (const path of scaffolded.filter((path) => !path.startsWith(CLAUDE_CODE))) {
      expect(await read(scenario("0201"), path), path).toBe(await read(copy.dir, path));
    }
  });
});

describe("0501 Claude Code", () => {
  test("holds exactly what init scaffolds in 0101", async () => {
    await using copy = await copyScenarioProject("0101");
    await init(copy.dir);

    for (const path of filesIn(copy.dir)) {
      expect(await read(scenario("0501"), path), path).toBe(await read(copy.dir, path));
    }
  });
});
