// The environment variables a test case's harnesses need, from each harness's `requiredEnv`.
// Names only: their values stay in the shell that runs Thunderjar, and reach a container through
// `docker run -e NAME`.
import type { HarnessDeclaration, TestCaseDeclaration } from "../api/declarations.ts";
import { ENV_NAME } from "./envName.ts";
import { PARAMETERS } from "./folders.ts";
import { ConfigError, loadDeclaration, type Problem, problemsError } from "./loader.ts";
import { parsePair } from "./permutations.ts";


const show = (value: unknown) => JSON.stringify(value) ?? String(value);

/** Why `requiredEnv`, as loaded, isn't a list of variable names, or undefined if it is one. */
export function requiredEnvProblem(requiredEnv: unknown): string | undefined {
  if (requiredEnv === undefined) return undefined;
  if (!Array.isArray(requiredEnv)) return `must be an array of environment variable names, got ${show(requiredEnv)}`;
  const bad = requiredEnv.filter((name) => typeof name !== "string" || !ENV_NAME.test(name));
  if (bad.length > 0) return `${bad.map(show).join(", ")} ${bad.length === 1 ? "is not an environment variable name" : "are not environment variable names"}`;
  return undefined;
}

/** The variables `harness` needs, as declared. */
export const requiredEnvOf = (harness: HarnessDeclaration): string[] => harness.requiredEnv ?? [];

/**
 * Checks that every variable each harness of `testCase`, a test case of `root` already checked by
 * `loadTestCase`, needs is set in `env`. Throws a ConfigError naming each that isn't, and the
 * harness that needs it, so it can be called before anything is built. An empty value counts as
 * unset: no agent can use an empty key.
 */
export async function checkRequiredEnv(root: string, testCase: TestCaseDeclaration, env: Record<string, string | undefined> = Bun.env): Promise<void> {
  const harnesses = [...new Set(testCase.harnessModel.map((pair) => parsePair(pair).harness))];
  const problems: Problem[] = [];
  const missing: string[] = [];
  for (const name of harnesses) {
    const harness = (await loadDeclaration(root, `${PARAMETERS}/harnessModels/${name}/index.ts`, "declareHarness", problems)) as
      | HarnessDeclaration
      | undefined;
    for (const variable of harness ? requiredEnvOf(harness) : []) {
      if (!env[variable]) missing.push(`${name} needs ${variable}, which is not set.`);
    }
  }
  if (problems.length > 0) throw problemsError(problems);
  if (missing.length === 0) return;
  const hint = `Export ${missing.length === 1 ? "it" : "them"} in the shell that runs thunderjar.`;
  throw new ConfigError(...missing.slice(0, -1), `${missing.at(-1)}\n${hint}`);
}
