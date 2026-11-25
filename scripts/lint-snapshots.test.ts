import { describe, expect, test } from "bun:test";
import { snapshotUses } from "./lint-snapshots";

describe("snapshotUses", () => {
  test("flags each snapshot matcher, with its line", () => {
    const source = `expect(a).toBe(1);\nexpect(b).toMatchSnapshot();\nexpect(c).toMatchInlineSnapshot(\`x\`);\nexpect(f).toThrowErrorMatchingSnapshot();\nexpect(g).toThrowErrorMatchingInlineSnapshot();\n`;
    expect(snapshotUses("src/a.test.ts", source)).toEqual([
      { path: "src/a.test.ts", line: 2, matcher: "toMatchSnapshot" },
      { path: "src/a.test.ts", line: 3, matcher: "toMatchInlineSnapshot" },
      { path: "src/a.test.ts", line: 4, matcher: "toThrowErrorMatchingSnapshot" },
      { path: "src/a.test.ts", line: 5, matcher: "toThrowErrorMatchingInlineSnapshot" },
    ]);
  });

  test("allows snapshots in *.humans.* files", () => {
    expect(snapshotUses("src/plan.humans.test.ts", "expect(a).toMatchInlineSnapshot();")).toEqual([]);
  });
});
