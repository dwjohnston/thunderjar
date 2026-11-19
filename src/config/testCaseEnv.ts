/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLjTC1bzhycPs8knbmL
 * Supervising engineer: Claude
 *
 *
 * Humans: add your notes here
 *
 *
 */

// A test case's own environment variables: `env`, with values written in the test case, and
// `secretEnv`, names only, whose values stay in the shell that runs Thunderjar.
import type { TestCaseDeclaration } from "../api/declarations.ts";
import { ENV_NAME } from "./envName.ts";
import { requiredEnvProblem } from "./requiredEnv.ts";

const show = (value: unknown) => JSON.stringify(value) ?? String(value);

/** What's wrong with a field of a test case's environment. */
export type EnvProblem = { field: string; message: string };

/** Why `env`, as loaded, isn't an object of one-line string values by variable name: none if it is one. */
function envProblems(env: unknown): EnvProblem[] {
  if (env === undefined) return [];
  if (typeof env !== "object" || env === null || Array.isArray(env)) {
    return [{ field: "env", message: `must be an object of values by environment variable name, e.g. { NODE_ENV: "test" }, got ${show(env)}` }];
  }
  const problems: EnvProblem[] = [];
  const bad = Object.keys(env).filter((name) => !ENV_NAME.test(name));
  if (bad.length > 0) {
    problems.push({ field: "env", message: `${bad.map(show).join(", ")} ${bad.length === 1 ? "is not an environment variable name" : "are not environment variable names"}` });
  }
  for (const [name, value] of Object.entries(env)) {
    if (!ENV_NAME.test(name)) continue;
    if (typeof value !== "string") problems.push({ field: `env.${name}`, message: `must be a string, got ${show(value)}` });
    else if (/[\r\n]/.test(value)) problems.push({ field: `env.${name}`, message: "must be on one line: a postrun image can't keep a value with a newline" });
  }
  return problems;
}

/**
 * What's wrong with `testCase`'s `env` and `secretEnv`, as loaded: bad names, values that aren't
 * strings or have a newline, and a name in both. Empty if nothing is.
 */
export function testCaseEnvProblems(testCase: Record<string, unknown>): EnvProblem[] {
  const problems = envProblems(testCase.env);
  const secretProblem = requiredEnvProblem(testCase.secretEnv);
  if (secretProblem) problems.push({ field: "secretEnv", message: secretProblem });
  if (problems.length > 0) return problems;
  const env = (testCase.env ?? {}) as Record<string, string>;
  const both = ((testCase.secretEnv ?? []) as string[]).filter((name) => Object.hasOwn(env, name));
  if (both.length > 0) {
    problems.push({
      field: "secretEnv",
      message: `${both.map(show).join(", ")} ${both.length === 1 ? "is" : "are"} in env too. Give a variable in env, with its value, or in secretEnv, from the shell, not both`,
    });
  }
  return problems;
}

/** `testCase`'s variables with their values, as declared. */
export const envOf = (testCase: TestCaseDeclaration): Record<string, string> => ({ ...testCase.env });

/** The names of `testCase`'s secret variables, as declared, each once. */
export const secretEnvOf = (testCase: TestCaseDeclaration): string[] => [...new Set(testCase.secretEnv ?? [])];
