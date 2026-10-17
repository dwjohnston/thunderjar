// Runs the CLI in a fixture scenario's project, as its tests do:
//
//   bun run fixture <scenario> <thunderjar args…>
//   bun run fixture scenario_2 run two-pairs --dry-run
//   bun run fixture 2 run two-pairs --dry-run
//
// <scenario> is a folder under fixtureTests/, or the start of one's name, with or without
// `scenario_`. `build` runs against real Docker:
//
//   bun run fixture 2 build two-pairs
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

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

const proc = Bun.spawn(["bun", join(repo, "src", "cli", "index.ts"), ...args], {
  cwd: join(fixtureTests, matches[0]!, "fixtures"),
  stdio: ["inherit", "inherit", "inherit"],
});
process.exit(await proc.exited);
