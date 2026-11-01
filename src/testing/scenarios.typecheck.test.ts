// Type-checks each scenario that has a tsconfig.json beside its project/, the way a user's
// editor would check it. Generated parameter names are global types, so each scenario is its
// own `tsc` program. `thunderjar` resolves through the checked-in fixtures/node_modules/thunderjar.
// A scenario without a tsconfig.json isn't checked: a project before `init`, for one.
//
// Scenarios in 04_unhappy are broken on purpose: each must fail with exactly the errors listed
// for it in EXPECTED_ERRORS, so it can't fail for the wrong reason.
import { describe, expect, test } from "bun:test";
import { $ } from "bun";
import { listScenarios, REPO_ROOT, type ScenarioInfo } from "./scenario.ts";

const tsc = `${REPO_ROOT}/node_modules/.bin/tsc`;
const UNHAPPY = "04_unhappy";

/** The errors `tsc` reports for each type-checked 04_unhappy scenario, by ID, paths relative to its folder. */
const EXPECTED_ERRORS: Record<string, string[]> = {
  "0401": [
    `project/.thunderjar/test-cases/example.ts(6,15): error TS2322: Type '"snerkk"' is not assignable to type '"snerk"'.`,
  ],
};

const checked: ScenarioInfo[] = [];
for (const s of listScenarios()) {
  if (await Bun.file(`${s.folder}/tsconfig.json`).exists()) checked.push(s);
}

const typecheck = async (s: ScenarioInfo) => {
  const result = await $`${tsc} --noEmit -p ${s.folder}/tsconfig.json`.cwd(s.folder).quiet().nothrow();
  return { output: result.stdout.toString() + result.stderr.toString(), exitCode: result.exitCode };
};

describe("scenario type-check", () => {
  test("discovers the scenarios to check", () => {
    expect(checked.every((s) => /^\d{4}$/.test(s.id))).toBe(true);
  });

  test("lists the expected errors of exactly the 04_unhappy scenarios it checks", () => {
    const unhappy = checked.filter((s) => s.group === UNHAPPY).map((s) => s.id);
    expect(Object.keys(EXPECTED_ERRORS).toSorted()).toEqual(unhappy);
  });

  for (const s of checked) {
    if (s.group === UNHAPPY) {
      test(
        `${s.group}/${s.name} fails to type-check, with the expected errors`,
        async () => {
          const { output, exitCode } = await typecheck(s);
          expect(output.trimEnd().split("\n")).toEqual(EXPECTED_ERRORS[s.id] ?? []);
          expect(exitCode).not.toBe(0);
        },
        30_000,
      );
    } else {
      test(
        `${s.group}/${s.name} type-checks`,
        async () => {
          const { output, exitCode } = await typecheck(s);
          expect(output).toBe("");
          expect(exitCode).toBe(0);
        },
        30_000,
      );
    }
  }
});
