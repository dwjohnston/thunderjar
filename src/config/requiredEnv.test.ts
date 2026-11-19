import { describe, expect, test } from "bun:test";
import { declareHarness } from "../api/declarations.ts";
import { envNamesProblem, requiredEnvOf, requiredEnvProblem } from "./requiredEnv.ts";

describe("requiredEnvProblem", () => {
  test("none declared, or a list of names, is fine", () => {
    expect(requiredEnvProblem(undefined)).toBeUndefined();
    expect(requiredEnvProblem([])).toBeUndefined();
    expect(requiredEnvProblem(["ANTHROPIC_API_KEY", "_private", "key2"])).toBeUndefined();
  });

  test("so is a oneOf of names, among them", () => {
    expect(requiredEnvProblem([{ oneOf: ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"] }, "OTHER"])).toBeUndefined();
  });

  test("anything else says what's wrong with it", () => {
    expect(requiredEnvProblem("ANTHROPIC_API_KEY")).toBe('must be an array of environment variable names, got "ANTHROPIC_API_KEY"');
    expect(requiredEnvProblem(["2FA"])).toBe('"2FA" is not an environment variable name');
    expect(requiredEnvProblem(["OK", "NOT=OK", null])).toBe('"NOT=OK", null are not environment variable names');
    expect(requiredEnvProblem([{}])).toBe("{} is not an environment variable name");
  });

  test("a oneOf that's empty, or not all names, says so", () => {
    const message = ": oneOf must be a non-empty array of environment variable names";
    expect(requiredEnvProblem([{ oneOf: [] }])).toBe(`{"oneOf":[]}${message}`);
    expect(requiredEnvProblem([{ oneOf: "KEY" }])).toBe(`{"oneOf":"KEY"}${message}`);
    expect(requiredEnvProblem([{ oneOf: ["OK", "NOT OK"] }])).toBe(`{"oneOf":["OK","NOT OK"]}${message}`);
  });
});

describe("envNamesProblem", () => {
  test("takes names only, not a oneOf: a test case's secretEnv", () => {
    expect(envNamesProblem(["A", "B"])).toBeUndefined();
    expect(envNamesProblem([{ oneOf: ["A"] }])).toBe('{"oneOf":["A"]} is not an environment variable name');
  });
});

describe("requiredEnvOf", () => {
  const harness = declareHarness({
    version: "1.0.0",
    applyParameter: () => "",
    requiredEnv: ["OTHER", { oneOf: ["TOKEN", "KEY"] }],
  });

  test("of a oneOf, gives the first that's set, and only it", () => {
    expect(requiredEnvOf(harness, { OTHER: "o", TOKEN: "t", KEY: "k" })).toEqual(["OTHER", "TOKEN"]);
    expect(requiredEnvOf(harness, { OTHER: "o", KEY: "k" })).toEqual(["OTHER", "KEY"]);
  });

  test("an empty value counts as unset", () => {
    expect(requiredEnvOf(harness, { TOKEN: "", KEY: "k" })).toEqual(["OTHER", "KEY"]);
  });

  test("with none set, its first", () => {
    expect(requiredEnvOf(harness, {})).toEqual(["OTHER", "TOKEN"]);
  });
});
