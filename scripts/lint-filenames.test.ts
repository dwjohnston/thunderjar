import { describe, expect, test } from "bun:test";
import { misnamed } from "./lint-filenames";

describe("misnamed", () => {
  test("flags *.human.* and suggests *.humans.*", () => {
    expect(misnamed(["src/cli/commands/plan/plan.human.test.ts"])).toEqual([
      { path: "src/cli/commands/plan/plan.human.test.ts", suggestion: "src/cli/commands/plan/plan.humans.test.ts" },
    ]);
  });

  test("allows *.humans.* and names merely containing human", () => {
    expect(misnamed(["src/plan.humans.test.ts", "src/human.ts", "src/inhuman.test.ts", "human.dir/a.ts"])).toEqual([]);
  });
});
