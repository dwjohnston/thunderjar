// `thunderjar init`, through the CLI, on a copy of an uninitialised scenario, because it writes into the project.
import { describe, expect, test } from "bun:test";
import { $, Glob } from "bun";
import { copyScenarioProject, thunderjar } from "../../../testing/cli.ts";
import { REPO_ROOT } from "../../../testing/scenario.ts";

/** Every file under `.thunderjar/` in `dir`, sorted. */
const filesIn = (dir: string) =>
  [...new Glob("**/*").scanSync({ cwd: `${dir}/.thunderjar`, dot: true })].toSorted();

const read = (dir: string, path: string) => Bun.file(`${dir}/.thunderjar/${path}`).text();

const P = "test-case-parameters";

/** What `init` scaffolds in any project, in the order it prints them, after the nested package.json. */
const SCAFFOLD = [
  "tsconfig.json",
  ".gitignore",
  "thunderjar.config.ts",
  "test-cases/example.ts",
  `${P}/baseImages/node20/index.ts`,
  `${P}/codeStates/baseline/index.ts`,
  `${P}/promptSets/snerk/index.ts`,
  `${P}/harnessModels/claude-code/index.ts`,
  `${P}/harnessModels/claude-code/models.ts`,
  `${P}/harnessModels/claude-code/versions.ts`,
  `${P}/harnessModels/claude-code/collectTokenCosts.ts`,
  `${P}/tasks/is-prime/initial-prompts/plain.ts`,
  `${P}/tasks/is-prime/measurements/isPrimeTsExists.ts`,
];

const createdLines = (paths: string[]) =>
  ["Created .thunderjar/", ...paths.map((path) => `Created .thunderjar/${path}`)].join("\n") + "\n";

describe("0101 empty project", () => {
  test("scaffolds .thunderjar/, with a nested package.json and its node_modules ignored", async () => {
    await using copy = await copyScenarioProject("0101");

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["init"]);

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
    expect(await read(copy.dir, "test-cases/example.ts")).toBe(`import { declareTestCase } from "thunderjar";

export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["claude-code@2.1.283/haiku-4-5"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 1,
});
`);
  });

  test("every TypeScript file it scaffolds imports thunderjar and loads", async () => {
    await using copy = await copyScenarioProject("0101");
    await thunderjar(copy.dir, ["init"]);

    const files = filesIn(copy.dir).filter((path) => path.endsWith(".ts"));
    expect(files).toHaveLength(SCAFFOLD.filter((path) => path.endsWith(".ts")).length);
    for (const path of files) {
      const module = await import(`${copy.dir}/.thunderjar/${path}`);
      expect(module.default).toBeDefined();
    }
  });

  test("what it scaffolds type-checks with its own tsconfig.json", async () => {
    await using copy = await copyScenarioProject("0101");
    await thunderjar(copy.dir, ["init"]);

    const result = await $`${REPO_ROOT}/node_modules/.bin/tsc --noEmit -p ${copy.dir}/.thunderjar/tsconfig.json`
      .quiet()
      .nothrow();

    expect(result.stdout.toString() + result.stderr.toString()).toBe("");
    expect(result.exitCode).toBe(0);
  }, 30_000);

  test("run again, it creates only what's missing and leaves the rest as it was", async () => {
    await using copy = await copyScenarioProject("0101");
    await thunderjar(copy.dir, ["init"]);
    await Bun.write(`${copy.dir}/.thunderjar/thunderjar.config.ts`, "// edited\n");
    await $`rm ${copy.dir}/.thunderjar/test-cases/example.ts`.quiet();

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["init"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(
      [
        "Created .thunderjar/test-cases/example.ts",
        ...["package.json", ...SCAFFOLD]
          .filter((path) => path !== "test-cases/example.ts")
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

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["init"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(createdLines(SCAFFOLD));
    expect(filesIn(copy.dir)).toEqual(SCAFFOLD.toSorted());
    expect(await read(copy.dir, ".gitignore")).toBe("_generated/\n.data/\n");
    expect(await Bun.file(`${copy.dir}/package.json`).text()).toBe(rootPackage);
  });
});
