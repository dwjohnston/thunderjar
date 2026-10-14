import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFixtureProject, linkThunderjar } from "../testing/fixture-project.ts";
import { plan } from "./plan.ts";

const tmp = () => mkdtemp(join(tmpdir(), "thunderjar-plan-"));

// spec/100-cli-reference.md#plan
const EXPECTED = [
  "baseImage:     node20",
  "codeState:     baseline",
  "promptSet:     snerk, glurk",
  "harnessModel:  claude-code@2.1.283/haiku-4-5, codex@0.9.0/gpt-luna",
  "task:          is-prime",
  "initialPrompt: plain, terse",
].join("\n");

test("prints the test case's named parameters", async () => {
  const dir = await tmp();
  await createFixtureProject(dir);
  await linkThunderjar(dir);

  expect(await plan("is-prime-baseline", dir)).toBe(EXPECTED);
});

test("throws a clear error for an unknown test case", async () => {
  const dir = await tmp();
  await createFixtureProject(dir);
  await linkThunderjar(dir);

  await expect(plan("no-such-test-case", dir)).rejects.toThrow(/no test case named "no-such-test-case"/);
});
