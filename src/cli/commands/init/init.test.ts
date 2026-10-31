// `thunderjar init`, through the CLI, in a copy of a checked-in fixtureTests/ scenario, because it
// writes into the project. Each test asserts on what it printed and the files it created or
// skipped. Any of these can be run by hand, in a scratch copy of the scenario:
//
//   cp -r fixtureTests/scenario_6_uninitialised_project/fixtures /tmp/s6 && cd /tmp/s6 && thunderjar init

import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { copyOfFixtures, scenario, thunderjar } from "../../../testing/cli.ts";

/** Every file under `.thunderjar/` in `dir`, sorted. */
const filesIn = (dir: string) =>
  readdirSync(join(dir, ".thunderjar"), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(join(dir, ".thunderjar").length + 1))
    .toSorted();

const read = (dir: string, rel: string) => readFile(join(dir, ".thunderjar", rel), "utf8");

/** What `init` scaffolds in any project, in the order it prints them. */
const SCAFFOLD = [
  "thunderjar.config.ts",
  "tsconfig.json",
  "test-cases/example.ts",
  "test-case-parameters/baseImages/node20/index.ts",
  "test-case-parameters/codeStates/baseline/index.ts",
  "test-case-parameters/promptSets/snerk/index.ts",
  "test-case-parameters/harnessModels/claude-code/index.ts",
  "test-case-parameters/harnessModels/claude-code/models.ts",
  "test-case-parameters/harnessModels/claude-code/versions.ts",
  "test-case-parameters/harnessModels/claude-code/collectTokenCosts.ts",
  "test-case-parameters/tasks/is-prime/initial-prompts/plain.ts",
  "test-case-parameters/tasks/is-prime/measurements/isPrimeTsExists.ts",
];

describe("scenario_6_uninitialised_project", () => {
  const fixtures = scenario("scenario_6_uninitialised_project");

  test("init: scaffolds .thunderjar/, with a nested package.json and node_modules ignored", async () => {
    const dir = await copyOfFixtures(fixtures);

    const { stdout, stderr, exitCode } = await thunderjar(dir, ["init"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const created = [...SCAFFOLD, "package.json", ".gitignore"];
    expect(stdout).toBe(created.map((f) => `created  .thunderjar/${f}\n`).join(""));
    expect(filesIn(dir)).toEqual(created.toSorted());
    expect(await read(dir, ".gitignore")).toBe("_generated/\n.data/\nnode_modules/\n");
    expect(JSON.parse(await read(dir, "package.json"))).toEqual({
      name: "thunderjar-config",
      private: true,
      type: "module",
      dependencies: { thunderjar: "latest" },
    });
    expect(await read(dir, "thunderjar.config.ts")).toBe(`import { declareConfig, sqliteStore } from "thunderjar";

export default declareConfig({
  imageStore: { repository: "ghcr.io/your-org/thunderjar-images" },
  runDataStore: sqliteStore({ path: "./.thunderjar/.data/runs.sqlite" }),
});
`);
  });

  test("init: every TypeScript file it scaffolds resolves its thunderjar imports", async () => {
    const dir = await copyOfFixtures(fixtures);

    await thunderjar(dir, ["init"]);

    for (const file of filesIn(dir).filter((f) => f.endsWith(".ts"))) {
      await import(join(dir, ".thunderjar", file));
    }
  });
});

describe("scenario_7_uninitialised_js_project", () => {
  const fixtures = scenario("scenario_7_uninitialised_js_project");

  test("init: a project with a root package.json gets no nested one", async () => {
    const dir = await copyOfFixtures(fixtures);

    const { stdout, stderr, exitCode } = await thunderjar(dir, ["init"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const created = [...SCAFFOLD, ".gitignore"];
    expect(stdout).toBe(created.map((f) => `created  .thunderjar/${f}\n`).join(""));
    expect(filesIn(dir)).toEqual(created.toSorted());
    expect(await read(dir, ".gitignore")).toBe("_generated/\n.data/\n");
  });
});

describe("scenario_1_minimal_initial_setup", () => {
  const fixtures = scenario("scenario_1_minimal_initial_setup");

  test("init: in an existing project, creates only what's missing and leaves the rest as it was", async () => {
    const dir = await copyOfFixtures(fixtures);
    const before = new Map(await Promise.all(filesIn(dir).map(async (f) => [f, await read(dir, f)] as const)));

    const { stdout, stderr, exitCode } = await thunderjar(dir, ["init"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`created  .thunderjar/tsconfig.json
created  .thunderjar/test-case-parameters/harnessModels/claude-code/index.ts
created  .thunderjar/test-case-parameters/harnessModels/claude-code/models.ts
created  .thunderjar/test-case-parameters/harnessModels/claude-code/versions.ts
created  .thunderjar/test-case-parameters/harnessModels/claude-code/collectTokenCosts.ts
created  .thunderjar/package.json
exists   .thunderjar/thunderjar.config.ts
exists   .thunderjar/test-cases/example.ts
exists   .thunderjar/test-case-parameters/baseImages/node20/index.ts
exists   .thunderjar/test-case-parameters/codeStates/baseline/index.ts
exists   .thunderjar/test-case-parameters/promptSets/snerk/index.ts
exists   .thunderjar/test-case-parameters/tasks/is-prime/initial-prompts/plain.ts
exists   .thunderjar/test-case-parameters/tasks/is-prime/measurements/isPrimeTsExists.ts
exists   .thunderjar/.gitignore
`);
    for (const [file, content] of before) expect(await read(dir, file)).toBe(content);
    expect(await read(dir, "test-cases/example.ts")).toContain("fake-harness-alpha@1.0.0/fake-model-small");
  });
});
