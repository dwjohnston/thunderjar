import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SEED_COMMITS, seedRepo } from "./seed-repo.ts";

// Fixture declarations pin these hashes, so a change here is a change to every fixture that
// builds from the seed repository: regenerate them deliberately.
test("the seed repository's commits have the same hashes every time", async () => {
  const dir = await mkdtemp(join(tmpdir(), "thunderjar-seed-"));
  expect(await seedRepo(dir)).toEqual(SEED_COMMITS);
});
