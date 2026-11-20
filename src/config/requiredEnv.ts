// The environment variables a test case's harnesses need, from each harness's `requiredEnv`, and
// those it names itself, in its `secretEnv`. Names only: their values stay in the shell that runs Thunderjar, and reach a container through
// `docker run -e NAME`. A harness's entry can be `{ oneOf: [...] }`, any one of several, e.g. a
// subscription token or an API key: the first that's set is the one passed, so an agent that
// prefers one when given both never sees the other.
import type { HarnessDeclaration, RequiredEnv, TestCaseDeclaration } from "../api/declarations.ts";
import { ENV_NAME } from "./envName.ts";
import { PARAMETERS } from "./folders.ts";
import { ConfigError, loadDeclaration, type Problem, problemsError } from "./loader.ts";
import { parsePair } from "./permutations.ts";

type Env = Record<string, string | undefined>;

const show = (value: unknown) => JSON.stringify(value) ?? String(value);

const isName = (name: unknown): name is string => typeof name === "string" && ENV_NAME.test(name);

/** Why `names`, as loaded, isn't a list of variable names, or undefined if it is one. For a test case's `secretEnv`. */
export function envNamesProblem(names: unknown): string | undefined {
  if (names === undefined) return undefined;
  if (!Array.isArray(names)) return `must be an array of environment variable names, got ${show(names)}`;
  const bad = names.filter((name) => !isName(name));
  if (bad.length > 0) return `${bad.map(show).join(", ")} ${bad.length === 1 ? "is not an environment variable name" : "are not environment variable names"}`;
  return undefined;
}

const isOneOf = (entry: unknown): entry is { oneOf: unknown } =>
  typeof entry === "object" && entry !== null && !Array.isArray(entry) && Object.hasOwn(entry, "oneOf");

/** Why a harness's `requiredEnv`, as loaded, isn't a list of variable names and `{ oneOf: [names] }`, or undefined if it is one. */
export function requiredEnvProblem(requiredEnv: unknown): string | undefined {
  if (!Array.isArray(requiredEnv)) return envNamesProblem(requiredEnv);
  const oneOfs = requiredEnv.filter(isOneOf);
  const badOneOf = oneOfs.filter(({ oneOf }) => !Array.isArray(oneOf) || oneOf.length === 0 || !oneOf.every(isName));
  if (badOneOf.length > 0) return `${badOneOf.map(show).join(", ")}: oneOf must be a non-empty array of environment variable names`;
  return envNamesProblem(requiredEnv.filter((entry) => !isOneOf(entry)));
}

/** An entry's names: one, or each of a `oneOf`'s, in its order. */
const namesOf = (entry: RequiredEnv): string[] => (typeof entry === "string" ? [entry] : entry.oneOf);

/** Its names as a phrase: "A", "A or B", "A, B or C". */
const either = (names: string[]) => (names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`);

/**
 * The variables `harness` is given, by name: each it names, and of each `oneOf` the first set in
 * `env`, or its first if none is (`checkRequiredEnv` stops a run before then, and Docker leaves
 * an unset one out).
 */
export const requiredEnvOf = (harness: HarnessDeclaration, env: Env = Bun.env): string[] =>
  (harness.requiredEnv ?? []).map((entry) => {
    const names = namesOf(entry);
    return names.find((name) => env[name]) ?? (names[0] as string);
  });

/**
 * Checks that every variable each harness of `testCase`, a test case of `root` already checked by
 * `loadTestCase`, needs, one of each `oneOf`, and each of the test case's own `secretEnv`, is set
 * in `env`. Throws a ConfigError naming each that isn't, and the harness or test case that needs
 * it, so it can be called before anything is built. An empty value counts as unset: no agent can
 * use an empty key.
 */
export async function checkRequiredEnv(root: string, testCase: TestCaseDeclaration, env: Env = Bun.env): Promise<void> {
  const harnesses = [...new Set(testCase.harnessModel.map((pair) => parsePair(pair).harness))];
  const problems: Problem[] = [];
  const missing: string[] = [];
  for (const name of harnesses) {
    const harness = (await loadDeclaration(root, `${PARAMETERS}/harnessModels/${name}/index.ts`, "declareHarness", problems)) as
      | HarnessDeclaration
      | undefined;
    for (const entry of harness?.requiredEnv ?? []) {
      const names = namesOf(entry);
      if (names.some((variable) => env[variable])) continue;
      missing.push(names.length === 1 ? `${name} needs ${names[0]}, which is not set.` : `${name} needs one of ${either(names)}, none of which is set.`);
    }
  }
  if (problems.length > 0) throw problemsError(problems);
  for (const variable of new Set(testCase.secretEnv ?? [])) {
    if (!env[variable]) missing.push(`The test case needs ${variable}, in its secretEnv, which is not set.`);
  }
  if (missing.length === 0) return;
  const hint = `Export ${missing.length === 1 ? "it" : "them"} in the shell that runs thunderjar.`;
  throw new ConfigError(...missing.slice(0, -1), `${missing.at(-1)}\n${hint}`);
}
