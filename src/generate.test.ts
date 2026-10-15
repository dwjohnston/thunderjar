import { expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectParameterNames, renderParameterNames, writeGeneratedTypes } from "./generate.ts";
import { createFixtureProject, linkThunderjar } from "./testing/fixture-project.ts";

const tmp = () => mkdtemp(join(tmpdir(), "thunderjar-generate-"));

test("collects parameter names from the fixture project", async () => {
  const dir = await tmp();
  await createFixtureProject(dir);
  await linkThunderjar(dir);

  const names = await collectParameterNames(join(dir, ".thunderjar"));

  expect(names.baseImages).toEqual(["node20"]);
  expect(names.codeStates).toEqual(["baseline"]);
  expect(names.promptSets).toEqual(["glurk", "snerk"]);
  expect(names.tasks).toEqual({ "is-prime": ["plain", "terse"] });
  expect(names.harnessFamilies).toEqual({
    "claude-code": { versions: ["2.1.283", "2.2.0"], models: ["haiku-4-5", "sonnet-5-5"] },
    codex: { versions: ["0.9.0"], models: ["gpt-luna"] },
    "fake-agent": { versions: ["1.0.0"], models: ["fake"] },
  });
});

test("empty folders render as never", async () => {
  const dir = await tmp();
  const content = renderParameterNames(await collectParameterNames(join(dir, ".thunderjar")));

  expect(content).toContain('type BaseImageName = never;');
  expect(content).toContain('type TaskName = never;');
  expect(content).toContain("type InitialPromptNames = Record<string, never>;");
  expect(content).toContain("type HarnessModelName = never;");
});

test("renders the typed-pairs example from the spec", async () => {
  const dir = await tmp();
  await createFixtureProject(dir);
  await linkThunderjar(dir);

  const content = renderParameterNames(await collectParameterNames(join(dir, ".thunderjar")));

  expect(content).toContain('type PromptSetName = "glurk" | "snerk";');
  expect(content).toContain('type TaskName = "is-prime";');
  expect(content).toContain('"is-prime": "plain" | "terse";');
  expect(content).toContain("type HarnessModelName =");
  expect(content).toContain('`claude-code@${"2.1.283" | "2.2.0"}/${"haiku-4-5" | "sonnet-5-5"}`');
  expect(content).toContain('`codex@${"0.9.0"}/${"gpt-luna"}`');
});

test("writeGeneratedTypes writes _generated/parameter-names.d.ts", async () => {
  const dir = await tmp();
  await createFixtureProject(dir);
  await linkThunderjar(dir);

  const { path } = await writeGeneratedTypes(join(dir, ".thunderjar"));

  expect(path).toBe(join(dir, ".thunderjar", "_generated", "parameter-names.d.ts"));
  expect(await readFile(path, "utf8")).toContain('type BaseImageName = "node20";');
});
