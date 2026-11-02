import { describe, expect, test } from "bun:test";
import { runOptionsProblem } from "./runOptions.ts";

describe("runOptionsProblem", () => {
  test("none, or a list of options and values, is fine", () => {
    expect(runOptionsProblem(undefined)).toBeUndefined();
    expect(runOptionsProblem(["--security-opt", "seccomp=unconfined", "--cap-add=SYS_ADMIN"])).toBeUndefined();
  });

  test("anything else says what's wrong", () => {
    expect(runOptionsProblem("--privileged")).toBe('must be an array of docker run options and their values, each a string, got "--privileged"');
    expect(runOptionsProblem(["--memory", 512])).toBe('must be an array of docker run options and their values, each a string, got ["--memory",512]');
  });

  test("an option Thunderjar sets itself can't be given", () => {
    expect(runOptionsProblem(["--rm", "--name=mine"])).toBe('"--rm", "--name=mine" can\'t be given: Thunderjar sets them itself');
  });
});
