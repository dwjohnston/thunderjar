import { expect, test } from "bun:test";
import { makeTempDir } from "../platform/fs.ts";
import { SEED_COMMITS, seedRepo } from "./seed-repo.ts";

// Fixture declarations pin these hashes, so a change here is a change to every fixture that
// builds from the seed repository: regenerate them deliberately.
test("the seed repository's commits have the same hashes every time", async () => {
  const dir = await makeTempDir("thunderjar-seed-");
  expect(await seedRepo(dir)).toEqual(SEED_COMMITS);
});
