// Type-checks each scenario that has a tsconfig.json beside its project/, the way a user's
// editor would check it. Generated parameter names are global types, so each scenario is its
// own `tsc` program. `thunderjar` resolves through the checked-in fixtures/node_modules/thunderjar.
// A scenario without a tsconfig.json isn't checked: a project before `init`, or one broken on purpose.
import { describe, expect, test } from "bun:test";
import { $ } from "bun";
import { listScenarios, REPO_ROOT, type ScenarioInfo } from "./scenario.ts";

const tsc = `${REPO_ROOT}/node_modules/.bin/tsc`;

const checked: ScenarioInfo[] = [];
for (const s of listScenarios()) {
  if (await Bun.file(`${s.folder}/tsconfig.json`).exists()) checked.push(s);
}

describe("scenario type-check", () => {
  test("discovers the scenarios to check", () => {
    expect(checked.every((s) => /^\d{4}$/.test(s.id))).toBe(true);
  });

  for (const s of checked) {
    test(
      `${s.group}/${s.name} type-checks`,
      async () => {
        const result = await $`${tsc} --noEmit -p ${s.folder}/tsconfig.json`.quiet().nothrow();
        expect(result.stdout.toString() + result.stderr.toString()).toBe("");
        expect(result.exitCode).toBe(0);
      },
      30_000,
    );
  }
});
