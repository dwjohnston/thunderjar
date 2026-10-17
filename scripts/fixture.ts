// Runs the CLI in a fixture scenario's project, as its tests do:
//
//   bun run fixture <scenario> <thunderjar args…>
//   bun run fixture scenario_2 run two-pairs --dry-run
//   bun run fixture 2 run two-pairs --dry-run
//
// <scenario> is a folder under fixtureTests/, or the start of one's name, with or without
// `scenario_`.
//
// `build` reads commits, and fixtures/ sits in Thunderjar's own repository, which doesn't have
// them. So `build` runs in a fresh copy of fixtures/ that is also the seed repository
// (src/testing/seed-repo.ts), against real Docker:
//
//   bun run fixture 2 build two-pairs
import { readdirSync } from "node:fs";
import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { linkThunderjar } from "../src/testing/fixture-project.ts";
import { seedRepo } from "../src/testing/seed-repo.ts";

const repo = resolve(import.meta.dir, "..");
const fixtureTests = join(repo, "fixtureTests");
const scenarios = readdirSync(fixtureTests, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("scenario_"))
  .map((entry) => entry.name)
  .toSorted();

const [query, ...args] = process.argv.slice(2);
const matches = query
  ? scenarios.filter((name) => name === query || name.startsWith(query) || name.startsWith(`scenario_${query}_`))
  : [];

if (matches.length !== 1) {
  console.error(
    `${query ? `${matches.length === 0 ? "no" : "more than one"} scenario matching "${query}". ` : ""}` +
    `usage: bun run fixture <scenario> <thunderjar args…>\n\nScenarios:\n${scenarios.map((s) => `  ${s}`).join("\n")}`,
  );
  process.exit(1);
}

let cwd = join(fixtureTests, matches[0]!, "fixtures");
if (args[0] === "build") {
  const copy = await mkdtemp(join(tmpdir(), `thunderjar-${matches[0]}-`));
  await cp(cwd, copy, { recursive: true, filter: (src) => !/[/\\]\.thunderjar[/\\](\.data|_generated)$/.test(src) });
  await linkThunderjar(copy);
  await seedRepo(copy);
  console.error(`(in a copy of ${matches[0]}/fixtures that is also the seed repository: ${copy})\n`);
  cwd = copy;
}

const proc = Bun.spawn(["bun", join(repo, "src", "cli", "index.ts"), ...args], {
  cwd,
  stdio: ["inherit", "inherit", "inherit"],
});
process.exit(await proc.exited);
