import { describe, expect, test } from "bun:test";
import { dataDirFromArgs } from "./dataDir.ts";

describe(dataDirFromArgs, () => {
  test("reads --data-dir <dir> and --data-dir=<dir>, the last one winning", () => {
    expect(dataDirFromArgs(["show", "01k", "--data-dir", "./data"])).toBe("./data");
    expect(dataDirFromArgs(["show", "--data-dir=./a", "--data-dir", "./b"])).toBe("./b");
  });

  test("is undefined without one, with no value after it, or after --", () => {
    expect(dataDirFromArgs(["executions"])).toBeUndefined();
    expect(dataDirFromArgs(["executions", "--data-dir"])).toBeUndefined();
    expect(dataDirFromArgs(["run", "x", "--", "--data-dir", "./d"])).toBeUndefined();
  });
});
