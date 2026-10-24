import { expect, test } from "bun:test";
import { mkdtemp, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  abbreviateHash,
  hashBaseImage,
  hashCodeState,
  hashHarnessModelPair,
  hashInitialPrompt,
  hashMeasurement,
  hashPermutation,
  hashPromptSet,
} from "./hashing.ts";
import { loadMeasurements } from "../project/config.ts";
import { createFixtureProject, linkThunderjar, stub } from "../testing/fixture-project.ts";

/**
 * A fixture project with `changes` applied, returning its `test-case-parameters/` folder.
 * Each call is a new folder: an imported module is cached by path, so an edited map must
 * live at a different one.
 */
async function parameters(changes: Record<string, string | null> = {}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "thunderjar-hashing-"));
  await createFixtureProject(dir, changes);
  await linkThunderjar(dir);
  return join(dir, ".thunderjar", "test-case-parameters");
}

const MODELS = "harnessModels/fake-harness-alpha/models.ts";
const VERSIONS = "harnessModels/fake-harness-alpha/versions.ts";
const prefixed = (changes: Record<string, string | null>) =>
  Object.fromEntries(Object.entries(changes).map(([k, v]) => [`test-case-parameters/${k}`, v]));

/** The hash of every fake-harness-alpha pair in a project, keyed by its address. */
async function alphaPairs(changes: Record<string, string | null> = {}) {
  const family = join(await parameters(prefixed(changes)), "harnessModels", "fake-harness-alpha");
  const pairs: Record<string, string> = {};
  for (const version of ["1.0.0", "1.1.0"])
    for (const model of ["fake-model-small", "fake-model-large"])
      pairs[`fake-harness-alpha@${version}/${model}`] = await hashHarnessModelPair(family, version, model);
  return pairs;
}

test("a hash is a 64-character hex digest, abbreviated to its first 8", async () => {
  const hash = hashBaseImage(join(await parameters(), "baseImages", "node20"));
  expect(hash).toMatch(/^[0-9a-f]{64}$/);
  expect(abbreviateHash(hash)).toBe(hash.slice(0, 8));
});

test("the same content gives the same hash, in any folder", async () => {
  const a = await parameters();
  const b = await parameters();
  expect(hashBaseImage(join(a, "baseImages", "node20"))).toBe(hashBaseImage(join(b, "baseImages", "node20")));
  expect(hashCodeState(join(a, "codeStates", "baseline"))).toBe(hashCodeState(join(b, "codeStates", "baseline")));
  expect(hashPromptSet(join(a, "promptSets", "snerk"))).toBe(hashPromptSet(join(b, "promptSets", "snerk")));
});

test("renaming a folder keeps its hash; editing index.ts changes it", async () => {
  const dir = await parameters();
  const before = hashBaseImage(join(dir, "baseImages", "node20"));

  await rename(join(dir, "baseImages", "node20"), join(dir, "baseImages", "node-twenty"));
  expect(hashBaseImage(join(dir, "baseImages", "node-twenty"))).toBe(before);

  await writeFile(
    join(dir, "baseImages", "node-twenty", "index.ts"),
    stub("declareBaseImage", "{\n  applyParameter: () => `FROM node:22-bookworm`,\n}"),
  );
  expect(hashBaseImage(join(dir, "baseImages", "node-twenty"))).not.toBe(before);
});

test("a bundled file is part of a folder's hash, wherever it is nested", async () => {
  const dir = await parameters();
  const before = hashCodeState(join(dir, "codeStates", "baseline"));

  await Bun.write(join(dir, "codeStates", "baseline", "scripts", "setup.sh"), "npm ci\n");
  const withScript = hashCodeState(join(dir, "codeStates", "baseline"));
  expect(withScript).not.toBe(before);

  await Bun.write(join(dir, "codeStates", "baseline", "scripts", "setup.sh"), "npm install\n");
  expect(hashCodeState(join(dir, "codeStates", "baseline"))).not.toBe(withScript);
});

test("the order files were written in does not change a folder's hash", async () => {
  const a = await parameters({ "test-case-parameters/promptSets/snerk/a.md": "a", "test-case-parameters/promptSets/snerk/b.md": "b" });
  const b = await parameters({ "test-case-parameters/promptSets/snerk/b.md": "b", "test-case-parameters/promptSets/snerk/a.md": "a" });
  expect(hashPromptSet(join(a, "promptSets", "snerk"))).toBe(hashPromptSet(join(b, "promptSets", "snerk")));
});

test("an initial prompt is hashed by its own content; renaming keeps it, and measurements never count", async () => {
  const dir = await parameters();
  const prompts = join(dir, "tasks", "is-prime", "initial-prompts");
  const plain = hashInitialPrompt(join(prompts, "plain.ts"));
  expect(plain).not.toBe(hashInitialPrompt(join(prompts, "terse.ts")));

  await Bun.write(join(dir, "tasks", "is-prime", "measurements", "isPrimeTsExists.ts"), "// edited\n");
  expect(hashInitialPrompt(join(prompts, "plain.ts"))).toBe(plain);

  await rename(join(prompts, "plain.ts"), join(prompts, "simple.ts"));
  expect(hashInitialPrompt(join(prompts, "simple.ts"))).toBe(plain);
});

test("an initial prompt's timeout is part of its hash", async () => {
  const dir = await parameters();
  const path = join(dir, "tasks", "is-prime", "initial-prompts", "plain.ts");
  const before = hashInitialPrompt(path);
  await writeFile(path, (await Bun.file(path).text()).replace("timeoutSeconds: 600", "timeoutSeconds: 900"));
  expect(hashInitialPrompt(path)).not.toBe(before);
});

test("a family's pairs each have their own hash, the same in every project", async () => {
  const pairs = await alphaPairs();
  expect(new Set(Object.values(pairs)).size).toBe(4);
  expect(await alphaPairs()).toEqual(pairs);
});

test("adding a model or a version does not change existing pairs", async () => {
  const before = await alphaPairs();
  const after = await alphaPairs({
    [MODELS]: stub("declareHarnessModels", `{
  "fake-model-small": "fake-model-small-001",
  "fake-model-large": "fake-model-large-001",
  "fake-model-huge": "fake-model-huge-001",
}`),
    [VERSIONS]: stub("declareHarnessVersions", `{
  "1.0.0": { version: "1.0.0" },
  "1.1.0": { version: "1.1.0" },
  "2.3.0": { version: "2.3.0" },
}`),
  });
  expect(after).toEqual(before);
});

test("changing one model's ID changes only that model's pairs", async () => {
  const before = await alphaPairs();
  const after = await alphaPairs({
    [MODELS]: stub("declareHarnessModels", `{
  "fake-model-small": "fake-model-small-002",
  "fake-model-large": "fake-model-large-001",
}`),
  });
  expect(after["fake-harness-alpha@1.0.0/fake-model-small"]).not.toBe(before["fake-harness-alpha@1.0.0/fake-model-small"]);
  expect(after["fake-harness-alpha@1.1.0/fake-model-small"]).not.toBe(before["fake-harness-alpha@1.1.0/fake-model-small"]);
  expect(after["fake-harness-alpha@1.0.0/fake-model-large"]).toBe(before["fake-harness-alpha@1.0.0/fake-model-large"]!);
  expect(after["fake-harness-alpha@1.1.0/fake-model-large"]).toBe(before["fake-harness-alpha@1.1.0/fake-model-large"]!);
});

test("editing one version's overrides or resolved version changes only that version's pairs", async () => {
  const before = await alphaPairs();
  for (const entry of [`{ version: "1.1.1" }`, `{ version: "1.1.0", requiredEnv: ["FAKE_API_KEY", "EXTRA"] }`]) {
    const after = await alphaPairs({
      [VERSIONS]: stub("declareHarnessVersions", `{
  "1.0.0": { version: "1.0.0" },
  "1.1.0": ${entry},
}`),
    });
    expect(after["fake-harness-alpha@1.0.0/fake-model-small"]).toBe(before["fake-harness-alpha@1.0.0/fake-model-small"]!);
    expect(after["fake-harness-alpha@1.0.0/fake-model-large"]).toBe(before["fake-harness-alpha@1.0.0/fake-model-large"]!);
    expect(after["fake-harness-alpha@1.1.0/fake-model-small"]).not.toBe(before["fake-harness-alpha@1.1.0/fake-model-small"]);
    expect(after["fake-harness-alpha@1.1.0/fake-model-large"]).not.toBe(before["fake-harness-alpha@1.1.0/fake-model-large"]);
  }
});

test("renaming map keys or reordering map entries keeps the resolved pairs' hashes", async () => {
  const before = await alphaPairs({
    [VERSIONS]: stub("declareHarnessVersions", `{
  "1.0.0": { version: "1.0.0", requiredEnv: ["A"], cli: (ctx) => \`fake-harness-alpha \${ctx.modelId}\` },
  "1.1.0": { version: "1.1.0" },
}`),
  });
  const family = join(
    await parameters(
      prefixed({
        [MODELS]: stub("declareHarnessModels", `{
  "large": "fake-model-large-001",
  "small": "fake-model-small-001",
}`),
        [VERSIONS]: stub("declareHarnessVersions", `{
  "latest": { version: "1.1.0" },
  "pinned": { cli: (ctx) => \`fake-harness-alpha \${ctx.modelId}\`, requiredEnv: ["A"], version: "1.0.0" },
}`),
      }),
    ),
    "harnessModels",
    "fake-harness-alpha",
  );
  expect(await hashHarnessModelPair(family, "pinned", "small")).toBe(before["fake-harness-alpha@1.0.0/fake-model-small"]!);
  expect(await hashHarnessModelPair(family, "latest", "large")).toBe(before["fake-harness-alpha@1.1.0/fake-model-large"]!);
});

test("editing collectTokenCosts.ts changes nothing", async () => {
  const before = await alphaPairs();
  const after = await alphaPairs({
    "harnessModels/fake-harness-alpha/collectTokenCosts.ts": stub("declareTokenCostCollector", `
  (raw, ctx) => ({ outcome: "unavailable", reason: "unparseable" }),
`),
  });
  expect(after).toEqual(before);
});

test("editing shared execution content changes every pair in the family", async () => {
  const before = await alphaPairs();
  const after = await alphaPairs({ "harnessModels/fake-harness-alpha/install.sh": "echo install fake-harness-alpha\n" });
  for (const [pair, hash] of Object.entries(after)) expect(hash).not.toBe(before[pair]!);
});

test("renaming the family folder keeps its pairs' hashes", async () => {
  const dir = await parameters();
  const pair = await hashHarnessModelPair(join(dir, "harnessModels", "fake-harness-alpha"), "1.0.0", "fake-model-small");
  await rename(join(dir, "harnessModels", "fake-harness-alpha"), join(dir, "harnessModels", "alpha"));
  expect(await hashHarnessModelPair(join(dir, "harnessModels", "alpha"), "1.0.0", "fake-model-small")).toBe(pair);
});

test("a floating version is reported as not supported yet", async () => {
  const dir = await parameters(
    prefixed({ [VERSIONS]: stub("declareHarnessVersions", `{ latest: { determineHash: () => "echo 1.1.0" } }`) }),
  );
  await expect(hashHarnessModelPair(join(dir, "harnessModels", "fake-harness-alpha"), "latest", "fake-model-small")).rejects.toThrow(
    /floating versions are not supported yet/,
  );
});

test("a permutation hash combines its five parameter hashes, in any key order", () => {
  const hashes = { baseImage: "a", codeState: "b", promptSet: "c", harnessModel: "d", initialPrompt: "e" };
  const hash = hashPermutation(hashes);
  expect(hashPermutation({ initialPrompt: "e", harnessModel: "d", promptSet: "c", codeState: "b", baseImage: "a" })).toBe(
    hash,
  );
  for (const key of Object.keys(hashes)) expect(hashPermutation({ ...hashes, [key]: "z" })).not.toBe(hash);
  // Each hash counts by its role: swapping two values is a different permutation.
  expect(hashPermutation({ ...hashes, baseImage: "b", codeState: "a" })).not.toBe(hash);
});

// --- Measurements: spec/085-test-case-results.md#name-is-identity-hash-is-version ---

const IS_PRIME = { instrument: "fileCreated", config: { glob: "**/isPrime.ts" }, aggregate: ["rate"] } as const;

test("a measurement's hash covers its config", () => {
  expect(hashMeasurement(IS_PRIME)).toMatch(/^[0-9a-f]{64}$/);
  expect(hashMeasurement({ ...IS_PRIME, config: { glob: "**/isPrime.js" } })).not.toBe(hashMeasurement(IS_PRIME));
  expect(hashMeasurement({ ...IS_PRIME, instrument: "grep" })).not.toBe(hashMeasurement(IS_PRIME));
});

test("a measurement's hash leaves out aggregate", () => {
  const reaggregated = { ...IS_PRIME, aggregate: ["rate", "count"] };
  expect(hashMeasurement(reaggregated)).toBe(hashMeasurement(IS_PRIME));
});

test("renaming a measurement's file keeps its hash; editing it changes no parameter or permutation hash", async () => {
  const measurementFile = (glob: string) =>
    stub("declareMeasurement", `{ instrument: "fileCreated", config: { glob: "${glob}" }, aggregate: ["rate"] }`);
  const projectWith = (files: Record<string, string>) =>
    parameters({
      "test-case-parameters/tasks/is-prime/measurements/isPrimeTsExists.ts": null,
      "test-case-parameters/tasks/is-prime/measurements/readmeExists.ts": null,
      ...Object.fromEntries(Object.entries(files).map(([name, content]) => [`test-case-parameters/tasks/is-prime/measurements/${name}`, content])),
    });
  const hashesOf = async (files: Record<string, string>) => {
    const dir = await projectWith(files);
    const measurements = await loadMeasurements(join(dir, ".."), "is-prime");
    const prompt = hashInitialPrompt(join(dir, "tasks", "is-prime", "initial-prompts", "plain.ts"));
    return { measurements: Object.fromEntries(measurements.map((m) => [m.name, hashMeasurement(m)])), prompt };
  };

  const original = await hashesOf({ "isPrimeTsExists.ts": measurementFile("**/isPrime.ts") });
  const renamed = await hashesOf({ "primeFile.ts": measurementFile("**/isPrime.ts") });
  const edited = await hashesOf({ "isPrimeTsExists.ts": measurementFile("src/isPrime.ts") });

  expect(renamed.measurements.primeFile).toBe(original.measurements.isPrimeTsExists!);
  expect(edited.measurements.isPrimeTsExists).not.toBe(original.measurements.isPrimeTsExists!);
  // The initial prompt, and so every permutation using it, is unchanged throughout.
  expect(renamed.prompt).toBe(original.prompt);
  expect(edited.prompt).toBe(original.prompt);
});

test("a templateTest measurement's hash covers its template, but not an unreferenced file beside it", async () => {
  const MEASUREMENTS = "test-case-parameters/tasks/is-prime/measurements";
  const TEMPLATE = `test("2 is prime", () => expect({{defaultExport}}(2)).toBe(true));\n`;
  const hashOf = async (files: Record<string, string>) => {
    const dir = await parameters(Object.fromEntries(Object.entries(files).map(([name, content]) => [`${MEASUREMENTS}/${name}`, content])));
    const measurements = await loadMeasurements(join(dir, ".."), "is-prime");
    return hashMeasurement(measurements.find((m) => m.name === "isPrimeTemplateTest")!);
  };

  const original = await hashOf({ "isPrime.test.template.ts": TEMPLATE });
  expect(original).toMatch(/^[0-9a-f]{64}$/);
  expect(await hashOf({ "isPrime.test.template.ts": TEMPLATE })).toBe(original);
  expect(await hashOf({ "isPrime.test.template.ts": TEMPLATE.replace("(2)", "(3)") })).not.toBe(original);
  expect(await hashOf({ "isPrime.test.template.ts": TEMPLATE, "notes.template.md": "unrelated\n" })).toBe(original);
  expect(await hashOf({ "isPrime.test.template.ts": TEMPLATE, "other.test.template.ts": "// unrelated\n" })).toBe(original);
});

test("a measurement with a bundled file can't be hashed without the folder it is relative to", () => {
  const config = { subject: "**/isPrime.ts", template: "./isPrime.test.template.ts" };
  expect(() => hashMeasurement({ instrument: "templateTest", config })).toThrow(
    "a templateTest measurement's hash needs the folder its bundled files are in",
  );
});
