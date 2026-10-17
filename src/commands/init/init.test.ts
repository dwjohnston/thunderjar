import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { init } from "./init.ts";

const tmp = () => mkdtemp(join(tmpdir(), "thunderjar-init-"));

const repoRoot = resolve(import.meta.dir, "..", "..", "..");

/** Makes `thunderjar` resolvable from `dir`, the same way `bun link` would. */
async function linkThunderjar(dir: string) {
  await mkdir(join(dir, "node_modules"), { recursive: true });
  await symlink(repoRoot, join(dir, "node_modules", "thunderjar"), "dir");
}

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

test("generated files resolve their thunderjar imports", async () => {
  const dir = await tmp();
  const { created } = await init(dir);
  await linkThunderjar(dir);

  for (const file of created.filter((f) => f.endsWith(".ts"))) {
    await import(join(dir, ".thunderjar", file));
  }
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
