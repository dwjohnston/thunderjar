// Finds `.thunderjar/` and loads a test case from it — spec/050-setup-and-configure.md
// ("The CLI finds `.thunderjar/` by walking up from the current directory to the nearest
// one") and spec/055-declaring-test-cases.md.
//
// Loading checks the configuration by hand, against the files on disk rather than
// `_generated/`, so a stale generated file or an ignored type error is still caught.

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { declaredBy, type TestCaseDeclaration } from "./declarations.ts";

/** A problem in the user's `.thunderjar/` folder. The CLI prints the message and exits 1. */
export class ConfigError extends Error {}

export class ThunderjarRootNotFoundError extends ConfigError {
  constructor(startDir: string) {
    super(`error: no .thunderjar/ folder found in ${startDir} or any parent directory.\nRun \`thunderjar init\` first.`);
  }
}

export class TestCaseNotFoundError extends ConfigError {
  constructor(name: string, path: string) {
    super(`error: no test case named "${name}" (expected ${path})`);
  }
}

export interface Problem {
  /** Path of the offending file, relative to the `.thunderjar/` root. */
  file: string;
  field?: string;
  message: string;
}

/** One or more problems found while loading configuration, one line each. */
export class InvalidConfigError extends ConfigError {
  constructor(readonly problems: Problem[]) {
    super(
      problems
        .map(({ file, field, message }) => `error: .thunderjar/${file}: ${field ? `${field}: ` : ""}${message}`)
        .join("\n"),
    );
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

/**
 * Imports `<root>/<file>` and returns its default export, which must have been returned
 * by `declareFn`. Records a problem and returns undefined otherwise.
 */
export async function loadDeclaration(
  root: string,
  file: string,
  declareFn: string,
  problems: Problem[],
): Promise<unknown> {
  let module: { default?: unknown };
  try {
    module = (await import(join(root, file))) as { default?: unknown };
  } catch (error) {
    problems.push({ file, message: `could not be loaded: ${error instanceof Error ? error.message : String(error)}` });
    return undefined;
  }
  if (!("default" in module) || module.default === undefined) {
    problems.push({ file, message: `has no default export. Export \`${declareFn}(...)\` as the default.` });
    return undefined;
  }
  const by = declaredBy(module.default);
  if (by !== declareFn) {
    problems.push({
      file,
      message: by
        ? `default export is wrapped in ${by}, expected ${declareFn}.`
        : `default export is not wrapped in ${declareFn}(...).`,
    });
    return undefined;
  }
  return module.default;
}

const show = (value: unknown) => JSON.stringify(value) ?? String(value);

/** A required file, as a problem against the test case naming it if it is missing. */
function requireFile(root: string, testCaseFile: string, field: string, name: string, file: string, problems: Problem[]) {
  if (existsSync(join(root, file))) return true;
  problems.push({ file: testCaseFile, field, message: `${show(name)} has no matching ${file}` });
  return false;
}

const FOLDER_PARAMETERS = [
  ["baseImage", "baseImages", "declareBaseImage"],
  ["codeState", "codeStates", "declareCodeState"],
  ["promptSet", "promptSets", "declarePromptSet"],
] as const;

const ARRAY_FIELDS = ["baseImage", "codeState", "promptSet", "harnessModel", "initialPrompt"] as const;

const PAIR = /^([^@/]+)@([^/]+)\/(.+)$/;

/** Checks a loaded test case against the files under `test-case-parameters/`. */
async function checkTestCase(root: string, file: string, testCase: Record<string, unknown>, problems: Problem[]) {
  const parameters = "test-case-parameters";
  const names: Partial<Record<(typeof ARRAY_FIELDS)[number], string[]>> = {};

  for (const field of ARRAY_FIELDS) {
    const value = testCase[field];
    if (!Array.isArray(value)) {
      problems.push({ file, field, message: `must be an array of names, got ${show(value)}` });
    } else if (value.length === 0) {
      problems.push({ file, field, message: "must name at least one value, got []" });
    } else if (value.some((v) => typeof v !== "string")) {
      problems.push({ file, field, message: `must be an array of names, got ${show(value)}` });
    } else {
      names[field] = value;
    }
  }

  const iterations = testCase.iterations;
  if (typeof iterations !== "number" || !Number.isInteger(iterations) || iterations < 1) {
    problems.push({ file, field: "iterations", message: `must be a positive integer, got ${show(iterations)}` });
  }

  for (const [field, folder, declareFn] of FOLDER_PARAMETERS) {
    for (const name of names[field] ?? []) {
      const index = `${parameters}/${folder}/${name}/index.ts`;
      if (requireFile(root, file, field, name, index, problems)) {
        await loadDeclaration(root, index, declareFn, problems);
      }
    }
  }

  const task = testCase.task;
  let taskExists = false;
  if (typeof task !== "string") {
    problems.push({ file, field: "task", message: `must be a task name, got ${show(task)}` });
  } else {
    taskExists = requireFile(root, file, "task", task, `${parameters}/tasks/${task}/`, problems);
  }

  if (taskExists) {
    for (const name of names.initialPrompt ?? []) {
      const prompt = `${parameters}/tasks/${task}/initial-prompts/${name}.ts`;
      if (existsSync(join(root, prompt))) {
        await loadDeclaration(root, prompt, "declareInitialPrompt", problems);
        continue;
      }
      const owner = new Bun.Glob(`${parameters}/tasks/*/initial-prompts/${name}.ts`).scanSync({ cwd: root }).next().value;
      problems.push({
        file,
        field: "initialPrompt",
        message: owner
          ? `${show(name)} belongs to task ${show(owner.split("/")[2])}, not ${show(task)}`
          : `${show(name)} has no matching ${prompt}`,
      });
    }
  }

  for (const pair of names.harnessModel ?? []) {
    const match = PAIR.exec(pair);
    if (!match) {
      problems.push({ file, field: "harnessModel", message: `${show(pair)} is not of the form family@version/model` });
      continue;
    }
    const [, family, version, model] = match as unknown as [string, string, string, string];
    const familyDir = `${parameters}/harnessModels/${family}`;
    if (!requireFile(root, file, "harnessModel", pair, `${familyDir}/`, problems)) continue;

    const familyProblems: Problem[] = [];
    await loadDeclaration(root, `${familyDir}/index.ts`, "declareHarness", familyProblems);
    await loadDeclaration(root, `${familyDir}/collectTokenCosts.ts`, "declareTokenCostCollector", familyProblems);
    const versions = await loadDeclaration(root, `${familyDir}/versions.ts`, "declareHarnessVersions", familyProblems);
    const models = await loadDeclaration(root, `${familyDir}/models.ts`, "declareHarnessModels", familyProblems);
    for (const p of familyProblems) {
      if (!problems.some((q) => q.file === p.file && q.message === p.message)) problems.push(p);
    }

    if (versions && !Object.hasOwn(versions, version)) {
      problems.push({
        file,
        field: "harnessModel",
        message: `${show(pair)}: version ${show(version)} is not in ${familyDir}/versions.ts`,
      });
    }
    if (models && !Object.hasOwn(models, model)) {
      problems.push({
        file,
        field: "harnessModel",
        message: `${show(pair)}: model ${show(model)} is not in ${familyDir}/models.ts`,
      });
    }
  }
}

/** Loads and checks `test-cases/<name>.ts` under a `.thunderjar/` root. */
export async function loadTestCase(root: string, name: string): Promise<TestCaseDeclaration> {
  const file = `test-cases/${name}.ts`;
  const path = join(root, file);
  if (!existsSync(path)) throw new TestCaseNotFoundError(name, path);

  const problems: Problem[] = [];
  const testCase = await loadDeclaration(root, file, "declareTestCase", problems);
  if (testCase) await checkTestCase(root, file, testCase as Record<string, unknown>, problems);
  if (problems.length > 0) throw new InvalidConfigError(problems);
  return testCase as TestCaseDeclaration;
}
