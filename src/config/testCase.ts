// Loads a test case, and checks it against the declarations on disk rather than `_generated/`, so
// a stale generated file or an ignored type error is still caught. Only the declarations the test
// case names are loaded, so a broken one stops only the test cases naming it.
import type { TestCaseDeclaration } from "../api/declarations.ts";
import { foldersIn, PARAMETERS } from "./folders.ts";
import { ConfigError, existsIn, FOLDER, loadDeclaration, type Problem, problemsError } from "./loader.ts";
import { checkMeasurements } from "./measurements.ts";

const show = (value: unknown) => JSON.stringify(value) ?? String(value);

/** Each parameter folder, with what it holds, for when it holds none. */
const PARAMETER_FOLDERS = [
  ["baseImages", "base images"],
  ["codeStates", "code states"],
  ["promptSets", "prompt sets"],
  ["harnessModels", "harnesses"],
  ["tasks", "tasks"],
] as const;

/** Fails if a parameter folder declares nothing: no test case could be planned. */
async function checkParameterFolders(root: string): Promise<void> {
  const problems: string[] = [];
  for (const [folder, what] of PARAMETER_FOLDERS) {
    if ((await foldersIn(root, `${PARAMETERS}/${folder}`)).length === 0) {
      problems.push(`${FOLDER}/${PARAMETERS}/${folder}/ has no ${what}`);
    }
  }
  if (problems.length > 0) throw new ConfigError(...problems);
}

const FOLDER_FIELDS = [
  ["baseImage", "baseImages", "declareBaseImage"],
  ["codeState", "codeStates", "declareCodeState"],
  ["promptSet", "promptSets", "declarePromptSet"],
] as const;

const ARRAY_FIELDS = ["baseImage", "codeState", "promptSet", "harnessModel", "initialPrompt"] as const;

type ArrayField = (typeof ARRAY_FIELDS)[number];

const HARNESS_MODEL = /^([^@/]+)@([^/]+)\/(.+)$/;

type Harness = { versions: unknown; models: unknown };

class TestCaseChecker {
  readonly problems: Problem[] = [];
  private readonly harnesses = new Map<string, Harness>();

  constructor(
    private readonly root: string,
    private readonly file: string,
  ) {}

  private problem(field: string, message: string) {
    this.problems.push({ file: this.file, field, message });
  }

  /** Whether `<root>/<path>`, which `field` names as `name`, exists. Adds a problem if not. */
  private async requires(field: string, name: string, path: string): Promise<boolean> {
    if (await existsIn(this.root, path)) return true;
    this.problem(field, `${show(name)} has no matching ${FOLDER}/${path}`);
    return false;
  }

  /** The names in each array field, for those that are a non-empty array of names. */
  private arrays(testCase: Record<string, unknown>): Partial<Record<ArrayField, string[]>> {
    const names: Partial<Record<ArrayField, string[]>> = {};
    for (const field of ARRAY_FIELDS) {
      const value = testCase[field];
      if (!Array.isArray(value) || value.some((name) => typeof name !== "string")) {
        this.problem(field, `must be an array of names, got ${show(value)}`);
      } else if (value.length === 0) {
        this.problem(field, "must name at least one value, got []");
      } else {
        names[field] = value;
      }
    }
    return names;
  }

  private checkIterations(iterations: unknown) {
    if (typeof iterations !== "number" || !Number.isInteger(iterations) || iterations < 1) {
      this.problem("iterations", `must be a positive integer, got ${show(iterations)}`);
    }
  }

  private async checkFolderFields(names: Partial<Record<ArrayField, string[]>>) {
    for (const [field, folder, declareFn] of FOLDER_FIELDS) {
      for (const name of names[field] ?? []) {
        const index = `${PARAMETERS}/${folder}/${name}/index.ts`;
        if (await this.requires(field, name, index)) {
          await loadDeclaration(this.root, index, declareFn, this.problems);
        }
      }
    }
  }

  private async checkTask(task: unknown, initialPrompts: string[]) {
    if (typeof task !== "string") {
      this.problem("task", `must be a task name, got ${show(task)}`);
      return;
    }
    if (!(await this.requires("task", task, `${PARAMETERS}/tasks/${task}/`))) return;
    await checkMeasurements(this.root, task, this.problems);

    for (const name of initialPrompts) {
      const prompt = `${PARAMETERS}/tasks/${task}/initial-prompts/${name}.ts`;
      if (await existsIn(this.root, prompt)) {
        await loadDeclaration(this.root, prompt, "declareInitialPrompt", this.problems);
        continue;
      }
      const owner = new Bun.Glob(`${PARAMETERS}/tasks/*/initial-prompts/${name}.ts`).scanSync({ cwd: this.root }).next()
        .value as string | undefined;
      this.problem(
        "initialPrompt",
        owner
          ? `${show(name)} belongs to task ${show(owner.split("/")[2])}, not ${show(task)}`
          : `${show(name)} has no matching ${FOLDER}/${prompt}`,
      );
    }
  }

  /** The harness's declarations, loaded once however many of the test case's pairs name it. */
  private async harness(name: string): Promise<Harness> {
    const loaded = this.harnesses.get(name);
    if (loaded) return loaded;
    const dir = `${PARAMETERS}/harnessModels/${name}`;
    await loadDeclaration(this.root, `${dir}/index.ts`, "declareHarness", this.problems);
    await loadDeclaration(this.root, `${dir}/collectTokenCosts.ts`, "declareTokenCostCollector", this.problems);
    const harness = {
      versions: await loadDeclaration(this.root, `${dir}/versions.ts`, "declareHarnessVersions", this.problems),
      models: await loadDeclaration(this.root, `${dir}/models.ts`, "declareHarnessModels", this.problems),
    };
    this.harnesses.set(name, harness);
    return harness;
  }

  private async checkHarnessModels(pairs: string[]) {
    for (const pair of pairs) {
      const match = HARNESS_MODEL.exec(pair);
      if (!match) {
        this.problem("harnessModel", `${show(pair)} is not of the form harness@version/model`);
        continue;
      }
      const [, name, version, model] = match as unknown as [string, string, string, string];
      const dir = `${PARAMETERS}/harnessModels/${name}`;
      if (!(await this.requires("harnessModel", pair, `${dir}/`))) continue;

      const { versions, models } = await this.harness(name);
      if (versions && !Object.hasOwn(versions, version)) {
        this.problem("harnessModel", `${show(pair)}: version ${show(version)} is not in ${FOLDER}/${dir}/versions.ts`);
      }
      if (models && !Object.hasOwn(models, model)) {
        this.problem("harnessModel", `${show(pair)}: model ${show(model)} is not in ${FOLDER}/${dir}/models.ts`);
      }
    }
  }

  async check(testCase: Record<string, unknown>) {
    const names = this.arrays(testCase);
    this.checkIterations(testCase.iterations);
    await this.checkFolderFields(names);
    await this.checkTask(testCase.task, names.initialPrompt ?? []);
    await this.checkHarnessModels(names.harnessModel ?? []);
  }
}

/** The test case declared in `<root>/test-cases/<name>.ts`, checked against the declarations it names. */
export async function loadTestCase(root: string, name: string): Promise<TestCaseDeclaration> {
  await checkParameterFolders(root);
  const file = `test-cases/${name}.ts`;
  if (!(await existsIn(root, file))) {
    throw new ConfigError(`No test case named "${name}": expected ${FOLDER}/${file}.`);
  }
  const checker = new TestCaseChecker(root, file);
  const testCase = await loadDeclaration(root, file, "declareTestCase", checker.problems);
  if (testCase) await checker.check(testCase as Record<string, unknown>);
  if (checker.problems.length > 0) throw problemsError(checker.problems);
  return testCase as TestCaseDeclaration;
}
