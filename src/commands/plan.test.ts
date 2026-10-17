import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { memoryDocker } from "../testing/fake-docker.ts";
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
promptSet:     snerk (cd75eb5f), glurk (10059fa1)
harnessModel:  fake-harness-alpha@1.0.0/fake-model-small (1cfded20), fake-harness-beta@1.0.0/fake-model-large (fde31306)
task:          is-prime
initialPrompt: plain (9e30b385), terse (7bb8874f)

Matrix shape: 1/1/2/2/2 (8 permutations × 5 iterations = 40 container runs)

 1  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | plain
    prerun-h3ae8d594 (will build)

 2  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | terse
    prerun-h402eac7c (will build)

 3  node20 | baseline | snerk | fake-harness-beta@1.0.0/fake-model-large  | plain
    prerun-h89ce6d87 (will build)

 4  node20 | baseline | snerk | fake-harness-beta@1.0.0/fake-model-large  | terse
    prerun-haf29f0fa (will build)

 5  node20 | baseline | glurk | fake-harness-alpha@1.0.0/fake-model-small | plain
    prerun-h257bdc02 (will build)

 6  node20 | baseline | glurk | fake-harness-alpha@1.0.0/fake-model-small | terse
    prerun-h9d8d12ed (will build)

 7  node20 | baseline | glurk | fake-harness-beta@1.0.0/fake-model-large  | plain
    prerun-h97455516 (will build)

 8  node20 | baseline | glurk | fake-harness-beta@1.0.0/fake-model-large  | terse
    prerun-h4ca35225 (will build)`;

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
  harnessModel: ["fake-harness-alpha@1.0.0/fake-model-small", "fake-harness-beta@1.0.0/fake-model-large"],
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
  files: { "prompts/glurk.md": "FAKE_INSTRUCTIONS.md" },
  applyParameter: () => \`\`,
}`),
  });
  await linkThunderjar(dir);

  const output = await plan("is-prime-baseline", dir);
  const tags = output.match(/prerun-h[0-9a-f]{8}/g)!;
  const expectedTags = EXPECTED.match(/prerun-h[0-9a-f]{8}/g)!;
  expect(output).toContain("promptSet:     snerk (cd75eb5f), glurk (");
  expect(output).not.toContain("glurk (10059fa1)");
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
  harnessModel: ["fake-harness-beta@1.0.0/fake-model-large"],
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
      "promptSet:     snerk (cd75eb5f)",
      "harnessModel:  fake-harness-beta@1.0.0/fake-model-large (fde31306)",
      "task:          is-prime",
      "initialPrompt: terse (7bb8874f)",
      "",
      "Matrix shape: 1/1/1/1/1 (1 permutation × 1 iteration = 1 container run)",
      "",
      " 1  node20 | baseline | snerk | fake-harness-beta@1.0.0/fake-model-large | terse",
      "    prerun-haf29f0fa (will build)", // the same permutation as entry 4 of the larger test case
    ].join("\n"),
  );
});

test("throws a clear error for an unknown test case", async () => {
  const dir = await tmp();
  await createFixtureProject(dir);
  await linkThunderjar(dir);

  await expect(plan("no-such-test-case", dir)).rejects.toThrow(/no test case named "no-such-test-case"/);
});

test("a prerun image that already exists is shown as reused; the rest as built", async () => {
  const dir = await tmp();
  await createFixtureProject(dir);
  await linkThunderjar(dir);

  const docker = memoryDocker(["thunderjar:prerun-h3ae8d594", "thunderjar:prerun-h4ca35225"]);
  const output = await plan("is-prime-baseline", dir, { docker });
  expect(output.split("\n").filter((line) => line.includes("prerun-h"))).toEqual([
    "    prerun-h3ae8d594 (exists, reused)",
    "    prerun-h402eac7c (will build)",
    "    prerun-h89ce6d87 (will build)",
    "    prerun-haf29f0fa (will build)",
    "    prerun-h257bdc02 (will build)",
    "    prerun-h9d8d12ed (will build)",
    "    prerun-h97455516 (will build)",
    "    prerun-h4ca35225 (exists, reused)",
  ]);
  // An image is looked for in the repository it is tagged in.
  const elsewhere = await plan("is-prime-baseline", dir, { docker, repository: "somewhere-else" });
  expect(elsewhere).not.toContain("(exists, reused)");
});

test("without Docker, plan still prints, and says whether images exist is unknown", async () => {
  const dir = await tmp();
  await createFixtureProject(dir);
  await linkThunderjar(dir);

  const docker = { ...memoryDocker(), unreachable: async () => "Cannot connect to the Docker daemon" };
  const output = await plan("is-prime-baseline", dir, { docker });
  expect(output).toBe(
    `${EXPECTED.replaceAll(" (will build)", "")}\n\n` +
      "Docker can't be reached (Cannot connect to the Docker daemon), so whether each prerun image exists is unknown.",
  );
});
