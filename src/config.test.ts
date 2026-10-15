import { expect, test } from "bun:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findThunderjarRoot, loadMeasurements, loadTestCase, TestCaseNotFoundError, ThunderjarRootNotFoundError } from "./config.ts";
import { createFixtureProject, linkThunderjar } from "./testing/fixture-project.ts";

const tmp = () => mkdtemp(join(tmpdir(), "thunderjar-config-"));

test("finds .thunderjar/ in the current directory", async () => {
  const dir = await tmp();
  await createFixtureProject(dir);

  expect(findThunderjarRoot(dir)).toBe(join(dir, ".thunderjar"));
});

test("finds .thunderjar/ by walking up from a nested directory", async () => {
  const dir = await tmp();
  await createFixtureProject(dir);
  const nested = join(dir, "src", "deep", "nested");
  await mkdir(nested, { recursive: true });

  expect(findThunderjarRoot(nested)).toBe(join(dir, ".thunderjar"));
});

test("throws when no .thunderjar/ exists up to the filesystem root", async () => {
  const dir = await tmp();

  expect(() => findThunderjarRoot(dir)).toThrow(ThunderjarRootNotFoundError);
});

test("loads a declared test case", async () => {
  const dir = await tmp();
  await createFixtureProject(dir);
  await linkThunderjar(dir);

  const testCase = await loadTestCase(join(dir, ".thunderjar"), "is-prime-baseline");

  expect(testCase.baseImage).toEqual(["node20"]);
  expect(testCase.task).toBe("is-prime");
  expect(testCase.iterations).toBe(5);
});

test("throws a clear error for an unknown test case", async () => {
  const dir = await tmp();
  await createFixtureProject(dir);
  await linkThunderjar(dir);

  await expect(loadTestCase(join(dir, ".thunderjar"), "no-such-test-case")).rejects.toThrow(TestCaseNotFoundError);
});

test("loads a task's measurements by name, leaving out the supporting files beside them", async () => {
  const dir = await tmp();
  await createFixtureProject(dir);
  await linkThunderjar(dir);
  const root = join(dir, ".thunderjar");

  const measurements = await loadMeasurements(root, "is-prime");

  // isPrime.test.template.ts sits beside them, and isn't loaded as one.
  expect(measurements.map((m) => m.name)).toEqual(["isPrimeTemplateTest", "isPrimeTsExists", "readmeExists", "tsIgnoreCount"]);
  for (const { dir: measurementDir } of measurements) {
    expect(measurementDir).toBe(join(root, "test-case-parameters", "tasks", "is-prime", "measurements"));
  }
  expect(measurements.find((m) => m.name === "isPrimeTemplateTest")!.config).toEqual({
    subject: "**/isPrime.ts",
    template: "./isPrime.test.template.ts",
  });
});
