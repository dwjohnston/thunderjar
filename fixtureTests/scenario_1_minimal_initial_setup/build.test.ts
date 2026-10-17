// `thunderjar build` in the minimal project, in place: its parameters copy files kept beside
// their declarations, so no git repository or commit is needed. By hand:
//
//   bun run fixture scenario_1 build example

import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fakeDocker, scenarioFixtures, thunderjar } from "../helpers.ts";

const fixtures = scenarioFixtures(import.meta.dir);

test("build example: builds the prerun image from the files beside the declarations", async () => {
  const docker = await fakeDocker();
  const tmpDir = await mkdtemp(join(tmpdir(), "thunderjar-fixture-tmp-"));

  const { stdout, stderr, exitCode } = await thunderjar(fixtures, ["build", "example"], { ...docker.env, TMPDIR: tmpDir });

  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  expect(stdout).toEndWith("1 prerun image: 1 built, 0 reused\n");
  const [context] = readdirSync(join(tmpDir, "thunderjar", "builds"));
  expect(readdirSync(join(tmpDir, "thunderjar", "builds", context!), { recursive: true }).map(String)).toContain(
    join("parameters", "codeState", "files", "package.json"),
  );
});
