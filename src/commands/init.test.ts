import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { init } from "./init.ts";

const tmp = () => mkdtemp(join(tmpdir(), "thunderjar-init-"));

test("creates the configuration folder", async () => {
  const dir = await tmp();
  const { created, skipped } = await init(dir);
  expect(skipped).toEqual([]);
  for (const f of [
    "thunderjar.config.ts",
    "test-cases/example.ts",
    "test-case-parameters/baseImages/node20/index.ts",
    "test-case-parameters/codeStates/baseline/index.ts",
    "test-case-parameters/promptSets/snerk/index.ts",
    "test-case-parameters/harnessModels/claude-code/index.ts",
    "test-case-parameters/tasks/is-prime/initial-prompts/plain.ts",
  ]) {
    expect(created).toContain(f);
    expect(existsSync(join(dir, ".thunderjar", f))).toBe(true);
  }
});

test("non-JS project gets a nested package.json and node_modules ignore", async () => {
  const dir = await tmp();
  await init(dir);
  expect(existsSync(join(dir, ".thunderjar/package.json"))).toBe(true);
  const ignore = await readFile(join(dir, ".thunderjar/.gitignore"), "utf8");
  expect(ignore).toBe("_generated/\n.data/\nnode_modules/\n");
});

test("JS project gets no nested package.json", async () => {
  const dir = await tmp();
  await writeFile(join(dir, "package.json"), "{}");
  await init(dir);
  expect(existsSync(join(dir, ".thunderjar/package.json"))).toBe(false);
  expect(await readFile(join(dir, ".thunderjar/.gitignore"), "utf8")).toBe("_generated/\n.data/\n");
});

test("second run does not overwrite existing files", async () => {
  const dir = await tmp();
  await init(dir);
  const cfg = join(dir, ".thunderjar/thunderjar.config.ts");
  await writeFile(cfg, "// edited");
  const { created, skipped } = await init(dir);
  expect(created).toEqual([]);
  expect(skipped).toContain("thunderjar.config.ts");
  expect(await readFile(cfg, "utf8")).toBe("// edited");
});
