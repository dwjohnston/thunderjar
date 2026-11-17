import { describe, expect, test } from "bun:test";
import { requiredEnvProblem } from "./requiredEnv.ts";

describe("requiredEnvProblem", () => {
  test("none declared, or a list of names, is fine", () => {
    expect(requiredEnvProblem(undefined)).toBeUndefined();
    expect(requiredEnvProblem([])).toBeUndefined();
    expect(requiredEnvProblem(["ANTHROPIC_API_KEY", "_private", "key2"])).toBeUndefined();
  });

  test("anything else says what's wrong with it", () => {
    expect(requiredEnvProblem("ANTHROPIC_API_KEY")).toBe('must be an array of environment variable names, got "ANTHROPIC_API_KEY"');
    expect(requiredEnvProblem(["2FA"])).toBe('"2FA" is not an environment variable name');
    expect(requiredEnvProblem(["OK", "NOT=OK", null])).toBe('"NOT=OK", null are not environment variable names');
  });
});
