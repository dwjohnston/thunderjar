#!/usr/bin/env bun
// Runs the CLI in a scenario's project/, as its tests do:
//
//   bun run fixture <scenario ID> <thunderjar args…>
//   bun run fixture 0201 plan two-pairs
import { REPO_ROOT, listScenarios, findScenario } from "../src/testing/scenario.ts";

const [id, ...args] = Bun.argv.slice(2);

if (!id) {
  const known = listScenarios().map((s) => `  ${s.id}  ${s.group}/${s.name}`).join("\n") || "  (none)";
  console.error(`usage: bun run fixture <scenario ID> <thunderjar args…>\n\nScenarios:\n${known}`);
  process.exit(1);
}

let project: string;
try {
  project = findScenario(id, listScenarios()).project;
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}

const proc = Bun.spawn(["bun", `${REPO_ROOT}/src/cli/index.ts`, ...args], {
  cwd: project,
  stdio: ["inherit", "inherit", "inherit"],
});
process.exit(await proc.exited);
