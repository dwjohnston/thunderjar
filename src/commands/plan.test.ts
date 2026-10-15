import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createFixtureProject, linkThunderjar, stub } from "../testing/fixture-project.ts";
import { plan } from "./plan.ts";

const tmp = () => mkdtemp(join(tmpdir(), "thunderjar-plan-"));

const cli = resolve(import.meta.dir, "..", "cli", "index.ts");

// spec/100-cli-reference.md#plan, with the fixture project's real hashes. The fixture is
// deterministic, so these are exact: a changed hash is a change to execution identity, a
// tripwire to investigate rather than loosen (spec/120-test-boundaries.md). Regenerate them
// deliberately, in the change that alters the fixture or the hashing.
const EXPECTED = `baseImage:     node20 (26d9745f)
codeState:     baseline (f8347787)
promptSet:     snerk (75b565ee), glurk (b7f809fa)
harnessModel:  claude-code@2.1.283/haiku-4-5 (cd63409c), codex@0.9.0/gpt-luna (fed18e07)
task:          is-prime
initialPrompt: plain (9e30b385), terse (7bb8874f)

Matrix shape: 1/1/2/2/2 (8 permutations × 5 iterations = 40 container runs)

 1  node20 | baseline | snerk | claude-code@2.1.283/haiku-4-5 | plain
    prerun-h848b6f74

 2  node20 | baseline | snerk | claude-code@2.1.283/haiku-4-5 | terse
    prerun-h4fcb1a62

 3  node20 | baseline | snerk | codex@0.9.0/gpt-luna          | plain
    prerun-he8a3aaee

 4  node20 | baseline | snerk | codex@0.9.0/gpt-luna          | terse
    prerun-he8af79ce

 5  node20 | baseline | glurk | claude-code@2.1.283/haiku-4-5 | plain
    prerun-h5c8397d7

 6  node20 | baseline | glurk | claude-code@2.1.283/haiku-4-5 | terse
    prerun-hbf1b6f21

 7  node20 | baseline | glurk | codex@0.9.0/gpt-luna          | plain
    prerun-hd82f20b9

 8  node20 | baseline | glurk | codex@0.9.0/gpt-luna          | terse
    prerun-hf8d9ea44`;

test("`thunderjar plan` prints the parameters with their hashes, and each permutation's prerun image", async () => {
  const dir = await tmp();
  await createFixtureProject(dir);
  await linkThunderjar(dir);

  const proc = Bun.spawn(["bun", cli, "plan", "is-prime-baseline"], { cwd: dir, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  expect(stdout).toBe(`${EXPECTED}\n`);
});

test("renaming a parameter keeps its hash and every prerun image", async () => {
  const dir = await tmp();
  await createFixtureProject(dir, {
    "test-case-parameters/baseImages/node20/index.ts": null,
    "test-case-parameters/baseImages/node-lts/index.ts": stub("declareBaseImage", `{
  applyParameter: () => \`FROM node:20-bookworm\`,
}`),
    "test-cases/is-prime-baseline.ts": stub("declareTestCase", `{
  baseImage: ["node-lts"],
  codeState: ["baseline"],
  promptSet: ["snerk", "glurk"],
  harnessModel: ["claude-code@2.1.283/haiku-4-5", "codex@0.9.0/gpt-luna"],
  task: "is-prime",
  initialPrompt: ["plain", "terse"],
  iterations: 5,
}`),
  });
  await linkThunderjar(dir);

  const output = await plan("is-prime-baseline", dir);
  expect(output).toContain("baseImage:     node-lts (26d9745f)");
  expect(output.match(/prerun-h[0-9a-f]{8}/g)).toEqual(EXPECTED.match(/prerun-h[0-9a-f]{8}/g));
});

test("editing a parameter changes its hash and the prerun image of every permutation using it", async () => {
  const dir = await tmp();
  await createFixtureProject(dir, {
    "test-case-parameters/promptSets/glurk/index.ts": stub("declarePromptSet", `{
  commit: "f0f0f0",
  files: { "prompts/glurk.md": "CLAUDE.md" },
  applyParameter: () => \`\`,
}`),
  });
  await linkThunderjar(dir);

  const output = await plan("is-prime-baseline", dir);
  const tags = output.match(/prerun-h[0-9a-f]{8}/g)!;
  const expectedTags = EXPECTED.match(/prerun-h[0-9a-f]{8}/g)!;
  expect(output).toContain("promptSet:     snerk (75b565ee), glurk (");
  expect(output).not.toContain("glurk (b7f809fa)");
  expect(tags.slice(0, 4)).toEqual(expectedTags.slice(0, 4)); // snerk
  for (let i = 4; i < 8; i++) expect(expectedTags).not.toContain(tags[i]!); // glurk
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
      "baseImage:     node20 (26d9745f)",
      "codeState:     baseline (f8347787)",
      "promptSet:     snerk (75b565ee)",
      "harnessModel:  codex@0.9.0/gpt-luna (fed18e07)",
      "task:          is-prime",
      "initialPrompt: terse (7bb8874f)",
      "",
      "Matrix shape: 1/1/1/1/1 (1 permutation × 1 iteration = 1 container run)",
      "",
      " 1  node20 | baseline | snerk | codex@0.9.0/gpt-luna | terse",
      "    prerun-he8af79ce", // the same permutation as entry 4 of the larger test case
    ].join("\n"),
  );
});

test("throws a clear error for an unknown test case", async () => {
  const dir = await tmp();
  await createFixtureProject(dir);
  await linkThunderjar(dir);

  await expect(plan("no-such-test-case", dir)).rejects.toThrow(/no test case named "no-such-test-case"/);
});
