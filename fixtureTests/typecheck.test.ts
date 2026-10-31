
/**
 * 🙋‍♂️ What this is doing is basically running `thunderjar init` and `thunderjar generate` 
 * on each of the fixtureTest scenarios, and then runs a per-scenario typecheck. 
 * 
 * Why can't we just do regular type checking as part of the project? 
 * 
 * Because of the cleverness that is the 'the generated types just fit into the rest of the typings' 
 * We need to think of each set of typings as a distinct typescript project 
 */
// Type-level tests against checked-in fixture projects — spec/055-declaring-test-cases.md#typed-names.
//
// Each scenario is a folder:
//
//   <scenario>/
//     fixtures/.thunderjar/   a project's configuration folder, minus what init and generate write
//     *.test.ts               assertType / @ts-expect-error assertions against its generated names
//     tsconfig.json           extends fixtures/.thunderjar/tsconfig.json and adds the assertions
//
// Before checking, the scenario gets the tsconfig `init` scaffolds and the types `generate`
// writes, so it's type-checked the way a user's editor would check it. Generated names are
// ambient globals, so each scenario needs its own `tsc` program. `thunderjar` resolves through
// the checked-in fixtureTests/node_modules/thunderjar link. A scenario with no
// tsconfig.json isn't checked: a project before `init`, or one broken on purpose.

import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { copyFile, mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { generate } from "../src/cli/commands/generate/generate.ts";
import { init } from "../src/cli/commands/init/init.ts";

const here = import.meta.dir;
const repoRoot = resolve(here, "..");
const tsc = join(repoRoot, "node_modules", ".bin", "tsc");

const scenarios = (await readdir(here, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && existsSync(join(here, entry.name, "tsconfig.json")))
  .map((entry) => entry.name);

/** Copies in the `.thunderjar/tsconfig.json` that `init` scaffolds for a fresh project. */
async function copyScaffoldedTsconfig(fixturesDir: string) {
  const scratch = await mkdtemp(join(tmpdir(), "thunderjar-fixture-"));
  await init(scratch);
  const tsconfig = join(scratch, ".thunderjar", "tsconfig.json");
  expect(existsSync(tsconfig), "init scaffolds .thunderjar/tsconfig.json").toBe(true);
  await copyFile(tsconfig, join(fixturesDir, ".thunderjar", "tsconfig.json"));
}

async function runTsc(project: string): Promise<{ exitCode: number; output: string }> {
  const proc = Bun.spawn([tsc, "--noEmit", "-p", project], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  return { exitCode, output: stdout + stderr };
}

for (const scenario of scenarios) {
  test(
    `${scenario}: type assertions hold`,
    async () => {
      const scenarioDir = join(here, scenario);
      const fixturesDir = join(scenarioDir, "fixtures");
      await copyScaffoldedTsconfig(fixturesDir);
      await generate(fixturesDir);

      const { exitCode, output } = await runTsc(scenarioDir);
      expect(output).toBe("");
      expect(exitCode).toBe(0);
    },
    30000,
  );
}
