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
  hashPermutation,
  hashPromptSet,
} from "./hashing.ts";
import { createFixtureProject, linkThunderjar, stub } from "./testing/fixture-project.ts";

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

const MODELS = "harnessModels/claude-code/models.ts";
const VERSIONS = "harnessModels/claude-code/versions.ts";
const prefixed = (changes: Record<string, string | null>) =>
  Object.fromEntries(Object.entries(changes).map(([k, v]) => [`test-case-parameters/${k}`, v]));

/** The hash of every claude-code pair in a project, keyed by its address. */
async function claudeCodePairs(changes: Record<string, string | null> = {}) {
  const family = join(await parameters(prefixed(changes)), "harnessModels", "claude-code");
  const pairs: Record<string, string> = {};
  for (const version of ["2.1.283", "2.2.0"])
    for (const model of ["haiku-4-5", "sonnet-5-5"])
      pairs[`claude-code@${version}/${model}`] = await hashHarnessModelPair(family, version, model);
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
  const pairs = await claudeCodePairs();
  expect(new Set(Object.values(pairs)).size).toBe(4);
  expect(await claudeCodePairs()).toEqual(pairs);
});

test("adding a model or a version does not change existing pairs", async () => {
  const before = await claudeCodePairs();
  const after = await claudeCodePairs({
    [MODELS]: stub("declareHarnessModels", `{
  "haiku-4-5": "claude-haiku-4-5-20251001",
  "sonnet-5-5": "claude-sonnet-5-5",
  "opus-5-5": "claude-opus-5-5",
}`),
    [VERSIONS]: stub("declareHarnessVersions", `{
  "2.1.283": { version: "2.1.283" },
  "2.2.0": { version: "2.2.0" },
  "2.3.0": { version: "2.3.0" },
}`),
  });
  expect(after).toEqual(before);
});

test("changing one model's ID changes only that model's pairs", async () => {
  const before = await claudeCodePairs();
  const after = await claudeCodePairs({
    [MODELS]: stub("declareHarnessModels", `{
  "haiku-4-5": "claude-haiku-4-5-20251101",
  "sonnet-5-5": "claude-sonnet-5-5",
}`),
  });
  expect(after["claude-code@2.1.283/haiku-4-5"]).not.toBe(before["claude-code@2.1.283/haiku-4-5"]);
  expect(after["claude-code@2.2.0/haiku-4-5"]).not.toBe(before["claude-code@2.2.0/haiku-4-5"]);
  expect(after["claude-code@2.1.283/sonnet-5-5"]).toBe(before["claude-code@2.1.283/sonnet-5-5"]!);
  expect(after["claude-code@2.2.0/sonnet-5-5"]).toBe(before["claude-code@2.2.0/sonnet-5-5"]!);
});

test("editing one version's overrides or resolved version changes only that version's pairs", async () => {
  const before = await claudeCodePairs();
  for (const entry of [`{ version: "2.2.1" }`, `{ version: "2.2.0", requiredEnv: ["ANTHROPIC_API_KEY", "EXTRA"] }`]) {
    const after = await claudeCodePairs({
      [VERSIONS]: stub("declareHarnessVersions", `{
  "2.1.283": { version: "2.1.283" },
  "2.2.0": ${entry},
}`),
    });
    expect(after["claude-code@2.1.283/haiku-4-5"]).toBe(before["claude-code@2.1.283/haiku-4-5"]!);
    expect(after["claude-code@2.1.283/sonnet-5-5"]).toBe(before["claude-code@2.1.283/sonnet-5-5"]!);
    expect(after["claude-code@2.2.0/haiku-4-5"]).not.toBe(before["claude-code@2.2.0/haiku-4-5"]);
    expect(after["claude-code@2.2.0/sonnet-5-5"]).not.toBe(before["claude-code@2.2.0/sonnet-5-5"]);
  }
});

test("renaming map keys or reordering map entries keeps the resolved pairs' hashes", async () => {
  const before = await claudeCodePairs({
    [VERSIONS]: stub("declareHarnessVersions", `{
  "2.1.283": { version: "2.1.283", requiredEnv: ["A"], cli: (ctx) => \`claude \${ctx.modelId}\` },
  "2.2.0": { version: "2.2.0" },
}`),
  });
  const family = join(
    await parameters(
      prefixed({
        [MODELS]: stub("declareHarnessModels", `{
  "sonnet": "claude-sonnet-5-5",
  "haiku": "claude-haiku-4-5-20251001",
}`),
        [VERSIONS]: stub("declareHarnessVersions", `{
  "latest": { version: "2.2.0" },
  "pinned": { cli: (ctx) => \`claude \${ctx.modelId}\`, requiredEnv: ["A"], version: "2.1.283" },
}`),
      }),
    ),
    "harnessModels",
    "claude-code",
  );
  expect(await hashHarnessModelPair(family, "pinned", "haiku")).toBe(before["claude-code@2.1.283/haiku-4-5"]!);
  expect(await hashHarnessModelPair(family, "latest", "sonnet")).toBe(before["claude-code@2.2.0/sonnet-5-5"]!);
});

test("editing collectTokenCosts.ts changes nothing", async () => {
  const before = await claudeCodePairs();
  const after = await claudeCodePairs({
    "harnessModels/claude-code/collectTokenCosts.ts": stub("declareTokenCostCollector", `
  (raw, ctx) => ({ outcome: "unavailable", reason: "unparseable" }),
`),
  });
  expect(after).toEqual(before);
});

test("editing shared execution content changes every pair in the family", async () => {
  const before = await claudeCodePairs();
  const after = await claudeCodePairs({ "harnessModels/claude-code/install.sh": "npm install -g claude\n" });
  for (const [pair, hash] of Object.entries(after)) expect(hash).not.toBe(before[pair]!);
});

test("renaming the family folder keeps its pairs' hashes", async () => {
  const dir = await parameters();
  const pair = await hashHarnessModelPair(join(dir, "harnessModels", "claude-code"), "2.1.283", "haiku-4-5");
  await rename(join(dir, "harnessModels", "claude-code"), join(dir, "harnessModels", "claude"));
  expect(await hashHarnessModelPair(join(dir, "harnessModels", "claude"), "2.1.283", "haiku-4-5")).toBe(pair);
});

test("a floating version is reported as not supported yet", async () => {
  const dir = await parameters(
    prefixed({ [VERSIONS]: stub("declareHarnessVersions", `{ latest: { determineHash: () => "echo 2.2.0" } }`) }),
  );
  await expect(hashHarnessModelPair(join(dir, "harnessModels", "claude-code"), "latest", "haiku-4-5")).rejects.toThrow(
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
