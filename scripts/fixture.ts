// Runs the CLI in a fixture scenario's project, as its tests do:
//
//   bun run fixture <scenario> <thunderjar args…>
//   bun run fixture scenario_2 run two-pairs --dry-run
//   bun run fixture 2 run two-pairs --dry-run
//
// <scenario> is a folder under fixtureTests/, or the start of one's name, with or without
// `scenario_`. `build` and a real `run` use real Docker:
//
//   bun run fixture 2 build two-pairs
import { listEntries } from "../src/platform/fs.ts";
import { join, resolve } from "../src/platform/path.ts";

const repo = resolve(import.meta.dir, "..");
const fixtureTests = join(repo, "fixtureTests");
const scenarios = listEntries(fixtureTests)
  .filter((entry) => entry.isDirectory && entry.path.startsWith("scenario_"))
  .map((entry) => entry.path);

const [query, ...args] = Bun.argv.slice(2);
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
