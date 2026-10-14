import { expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFixtureProject, linkThunderjar } from "../testing/fixture-project.ts";
import { generate } from "./generate.ts";

const tmp = () => mkdtemp(join(tmpdir(), "thunderjar-generate-cmd-"));

test("writes _generated/parameter-names.d.ts from the current directory", async () => {
  const dir = await tmp();
  await createFixtureProject(dir);
  await linkThunderjar(dir);

  const { path } = await generate(dir);

  expect(path).toBe(join(dir, ".thunderjar", "_generated", "parameter-names.d.ts"));
  expect(await readFile(path, "utf8")).toContain('type CodeStateName = "baseline";');
});
