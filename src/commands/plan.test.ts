import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFixtureProject, linkThunderjar, stub } from "../testing/fixture-project.ts";
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
  "",
  "Matrix shape: 1/1/2/2/2 (8 permutations × 5 iterations = 40 container runs)",
  "",
  " 1  node20 | baseline | snerk | claude-code@2.1.283/haiku-4-5 | plain",
  " 2  node20 | baseline | snerk | claude-code@2.1.283/haiku-4-5 | terse",
  " 3  node20 | baseline | snerk | codex@0.9.0/gpt-luna          | plain",
  " 4  node20 | baseline | snerk | codex@0.9.0/gpt-luna          | terse",
  " 5  node20 | baseline | glurk | claude-code@2.1.283/haiku-4-5 | plain",
  " 6  node20 | baseline | glurk | claude-code@2.1.283/haiku-4-5 | terse",
  " 7  node20 | baseline | glurk | codex@0.9.0/gpt-luna          | plain",
  " 8  node20 | baseline | glurk | codex@0.9.0/gpt-luna          | terse",
].join("\n");

test("prints the test case's parameters, matrix shape and permutations", async () => {
  const dir = await tmp();
  await createFixtureProject(dir);
  await linkThunderjar(dir);

  expect(await plan("is-prime-baseline", dir)).toBe(EXPECTED);
});

test("a 1/1/1/1/1 test case has one permutation", async () => {
  const dir = await tmp();
  await createFixtureProject(dir, {
    "test-cases/single.ts": stub("declareTestCase", `{
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["codex@0.9.0/gpt-luna"],
  task: "is-prime",
  initialPrompt: ["terse"],
  iterations: 1,
}`),
  });
  await linkThunderjar(dir);

  expect(await plan("single", dir)).toBe(
    [
      "baseImage:     node20",
      "codeState:     baseline",
      "promptSet:     snerk",
      "harnessModel:  codex@0.9.0/gpt-luna",
      "task:          is-prime",
      "initialPrompt: terse",
      "",
      "Matrix shape: 1/1/1/1/1 (1 permutation × 1 iteration = 1 container run)",
      "",
      " 1  node20 | baseline | snerk | codex@0.9.0/gpt-luna | terse",
    ].join("\n"),
  );
});

test("throws a clear error for an unknown test case", async () => {
  const dir = await tmp();
  await createFixtureProject(dir);
  await linkThunderjar(dir);

  await expect(plan("no-such-test-case", dir)).rejects.toThrow(/no test case named "no-such-test-case"/);
});
