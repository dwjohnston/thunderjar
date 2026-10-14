// Finds `.thunderjar/` and loads a test case from it — spec/050-setup-and-configure.md
// ("The CLI finds `.thunderjar/` by walking up from the current directory to the nearest
// one") and spec/055-declaring-test-cases.md.

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { TestCaseDeclaration } from "./declarations.ts";

export class ThunderjarRootNotFoundError extends Error {
  constructor(startDir: string) {
    super(`error: no .thunderjar/ folder found in ${startDir} or any parent directory.\nRun \`thunderjar init\` first.`);
  }
}

export class TestCaseNotFoundError extends Error {
  constructor(name: string, path: string) {
    super(`error: no test case named "${name}" (expected ${path})`);
  }
}

/** Walks up from `startDir` to the nearest `.thunderjar/` folder, returning its path. */
export function findThunderjarRoot(startDir: string = process.cwd()): string {
  let dir = resolve(startDir);
  for (;;) {
    const candidate = join(dir, ".thunderjar");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) throw new ThunderjarRootNotFoundError(startDir);
    dir = parent;
  }
}

/** Loads `test-cases/<name>.ts` under a `.thunderjar/` root. */
export async function loadTestCase(root: string, name: string): Promise<TestCaseDeclaration> {
  const path = join(root, "test-cases", `${name}.ts`);
  if (!existsSync(path)) throw new TestCaseNotFoundError(name, path);
  const module = (await import(path)) as { default: TestCaseDeclaration };
  return module.default;
}
