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
import { describe, expect, test } from "bun:test";
import type { TestCaseDeclaration } from "../api/declarations.ts";
import { envOf, secretEnvOf, testCaseEnvProblems } from "./testCaseEnv.ts";

describe("testCaseEnvProblems", () => {
  test("none, or names with one-line string values, are fine", () => {
    expect(testCaseEnvProblems({})).toEqual([]);
    expect(testCaseEnvProblems({ env: {}, secretEnv: [] })).toEqual([]);
    expect(testCaseEnvProblems({ env: { NODE_ENV: "test", EMPTY: "", _x: 'a "quoted" $value' }, secretEnv: ["DATABASE_URL"] })).toEqual([]);
  });

  test("env that isn't an object of values by name", () => {
    for (const env of [["NODE_ENV=test"], "NODE_ENV=test", null]) {
      expect(testCaseEnvProblems({ env })).toEqual([
        { field: "env", message: `must be an object of values by environment variable name, e.g. { NODE_ENV: "test" }, got ${JSON.stringify(env)}` },
      ]);
    }
  });

  test("bad names, values that aren't strings, and values with a newline", () => {
    expect(testCaseEnvProblems({ env: { "A B": "x", "C=D": "y", N: 1, U: undefined, M: "a\r\nb" } })).toEqual([
      { field: "env", message: '"A B", "C=D" are not environment variable names' },
      { field: "env.N", message: "must be a string, got 1" },
      { field: "env.U", message: "must be a string, got undefined" },
      { field: "env.M", message: "must be on one line: a postrun image can't keep a value with a newline" },
    ]);
  });

  test("secretEnv that isn't a list of names", () => {
    expect(testCaseEnvProblems({ secretEnv: "DATABASE_URL" })).toEqual([
      { field: "secretEnv", message: 'must be an array of environment variable names, got "DATABASE_URL"' },
    ]);
    expect(testCaseEnvProblems({ secretEnv: ["OK", "NOT OK"] })).toEqual([{ field: "secretEnv", message: '"NOT OK" is not an environment variable name' }]);
  });

  test("a name in both", () => {
    expect(testCaseEnvProblems({ env: { A: "1", B: "2" }, secretEnv: ["A", "B", "C"] })).toEqual([
      { field: "secretEnv", message: '"A", "B" are in env too. Give a variable in env, with its value, or in secretEnv, from the shell, not both' },
    ]);
  });
});

describe("envOf and secretEnvOf", () => {
  const testCase = (fields: Partial<TestCaseDeclaration>) => fields as TestCaseDeclaration;

  test("are empty for a test case without them", () => {
    expect(envOf(testCase({}))).toEqual({});
    expect(secretEnvOf(testCase({}))).toEqual([]);
  });

  test("give each secret name once", () => {
    expect(secretEnvOf(testCase({ secretEnv: ["A", "B", "A"] }))).toEqual(["A", "B"]);
    expect(envOf(testCase({ env: { A: "1" } }))).toEqual({ A: "1" });
  });
});
