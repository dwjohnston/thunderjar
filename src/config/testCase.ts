// Loads a test case, and checks it against the declarations on disk rather than `_generated/`, so
// a stale generated file or an ignored type error is still caught. Only the declarations the test
// case names are loaded, so a broken one stops only the test cases naming it.
import { RUN_SCRIPT_PATH } from "../api/files.ts";
import type { TestCaseDeclaration } from "../api/declarations.ts";
import { foldersIn, PARAMETERS } from "./folders.ts";
import { ConfigError, existsIn, FOLDER, loadDeclaration, type Problem, problemsError } from "./loader.ts";
import { checkMeasurements } from "./measurements.ts";
import { requiredEnvProblem } from "./requiredEnv.ts";
import { runOptionsProblem } from "./runOptions.ts";

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

const HARNESS_MODEL = /^([^/]+)\/(.+)$/;

class TestCaseChecker {
  readonly problems: Problem[] = [];
  private readonly harnesses = new Set<string>();

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
          const declaration = (await loadDeclaration(this.root, index, declareFn, this.problems)) as Record<string, unknown> | undefined;
          const optionsProblem = field === "baseImage" && declaration && runOptionsProblem(declaration.runOptions);
          if (optionsProblem) this.problems.push({ file: index, field: "runOptions", message: optionsProblem });
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
        const declaration = (await loadDeclaration(this.root, prompt, "declareInitialPrompt", this.problems)) as
          | Record<string, unknown>
          | undefined;
        const timeout = declaration?.timeoutSeconds;
        if (declaration && (typeof timeout !== "number" || !Number.isFinite(timeout) || timeout <= 0)) {
          this.problems.push({ file: prompt, field: "timeoutSeconds", message: `must be a number of seconds above 0, got ${show(timeout)}` });
        }
        if (declaration) this.checkPrompt(prompt, declaration);
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

  /** An initial prompt writes its prompt with its fragment: `prompt` and `turns` are no longer read. */
  private checkPrompt(file: string, declaration: Record<string, unknown>) {
    for (const field of ["prompt", "turns"]) {
      if (declaration[field] !== undefined) {
        this.problems.push({
          file,
          field,
          message: "is no longer read. Write the prompt with the initial prompt's fragment: applyParameter: () => writePrompt(`…`).",
        });
      }
    }
  }

  /** Checks harness `name`'s declaration, once however many of the test case's pairs name it. */
  private async checkHarness(name: string) {
    if (this.harnesses.has(name)) return;
    this.harnesses.add(name);
    const file = `${PARAMETERS}/harnessModels/${name}/index.ts`;
    const declaration = (await loadDeclaration(this.root, file, "declareHarness", this.problems)) as Record<string, unknown> | undefined;
    if (!declaration) return;
    const problem = (field: string, message: string) => this.problems.push({ file, field, message });
    if (typeof declaration.version !== "string" || declaration.version.trim() === "") {
      problem("version", `must be the version of the agent the harness installs, e.g. "2.1.311", got ${show(declaration.version)}`);
    }
    if (declaration.cli !== undefined) {
      problem("cli", "is no longer read. The harness's fragment writes the command, with writeRunScript(command), and the model, with writeModel(ctx.modelId).");
    }
    if (typeof declaration.applyParameter !== "function") {
      problem("applyParameter", `must install the agent and write ${RUN_SCRIPT_PATH}, e.g. with writeRunScript(command), got ${show(declaration.applyParameter)}`);
    }
    const envProblem = requiredEnvProblem(declaration.requiredEnv);
    if (envProblem) problem("requiredEnv", envProblem);
    for (const field of ["collectReply", "collectTokenCosts"]) {
      if (declaration[field] !== undefined && typeof declaration[field] !== "function") {
        problem(field, `must be a function of the result file's text, got ${show(declaration[field])}`);
      }
    }
  }

  private async checkHarnessModels(pairs: string[]) {
    for (const pair of pairs) {
      const match = HARNESS_MODEL.exec(pair);
      if (!match) {
        this.problem("harnessModel", `${show(pair)} is not of the form <harness>/<model ID>`);
        continue;
      }
      const name = match[1] as string;
      if (name.includes("@") && !(await existsIn(this.root, `${PARAMETERS}/harnessModels/${name}/`))) {
        const folder = name.slice(0, name.indexOf("@"));
        this.problem(
          "harnessModel",
          `${show(pair)} is in the old form, <harness>@<version>/<model>. Name a harness folder, which pins its version, then the model ID its agent takes, e.g. "${folder}/<model ID>"`,
        );
        continue;
      }
      if (await this.requires("harnessModel", pair, `${PARAMETERS}/harnessModels/${name}/`)) await this.checkHarness(name);
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
