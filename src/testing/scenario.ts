import { Glob } from "bun";

export const REPO_ROOT = Bun.fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "");
export const FIXTURES_DIR = `${REPO_ROOT}/fixtures`;

/** A scenario folder, e.g. `{ id: "0201", group: "02_regular", name: "0201_minimal_existing_setup" }`. */
export type ScenarioInfo = {
  id: string;
  group: string;
  name: string;
  /** The scenario folder: `fixtures/<group>/<name>`. */
  folder: string;
  /** The user's project inside it: `fixtures/<group>/<name>/project`. */
  project: string;
};

// A scenario is a folder with a project/ in it.
const SCENARIO_PATTERN = "[0-9][0-9]_*/[0-9][0-9][0-9][0-9]_*/project";

/** Scenario folders, relative to `fixtures/`, e.g. `02_regular/0201_minimal_existing_setup`. */
function scenarioPaths(fixturesDir: string): string[] {
  try {
    return [...new Glob(SCENARIO_PATTERN).scanSync({ cwd: fixturesDir, onlyFiles: false })].map((path) =>
      path.replace(/\/project$/, ""),
    );
  } catch {
    return [];
  }
}

function toInfo(path: string, fixturesDir: string): ScenarioInfo {
  const [group, name] = path.split("/") as [string, string];
  const folder = `${fixturesDir}/${group}/${name}`;
  return { id: name.slice(0, 4), group, name, folder, project: `${folder}/project` };
}

/** Every scenario under `fixturesDir`, sorted by ID. */
export function listScenarios(fixturesDir: string = FIXTURES_DIR): ScenarioInfo[] {
  return scenarioPaths(fixturesDir)
    .filter((path) => /^\d{2}_[^/]+\/\d{4}_[^/]+$/.test(path))
    .map((path) => toInfo(path, fixturesDir))
    .toSorted((a, b) => a.id.localeCompare(b.id) || a.name.localeCompare(b.name));
}

/** The one scenario in `scenarios` with ID `id`. Throws for a malformed, unknown or ambiguous ID. */
export function findScenario(id: string, scenarios: ScenarioInfo[]): ScenarioInfo {
  if (!/^\d{4}$/.test(id)) {
    throw new Error(`Invalid scenario ID "${id}": expected 4 digits, e.g. "0201".`);
  }
  const matches = scenarios.filter((s) => s.id === id);
  if (matches.length === 1) return matches[0]!;
  const known = scenarios.map((s) => `  ${s.group}/${s.name}`).join("\n") || "  (none)";
  if (matches.length === 0) {
    throw new Error(`Unknown scenario "${id}". Scenarios in fixtures/:\n${known}`);
  }
  throw new Error(`Ambiguous scenario "${id}", it matches:\n${matches.map((s) => `  ${s.group}/${s.name}`).join("\n")}`);
}

/** Everything about the scenario with ID `id`, e.g. `scenarioInfo("0201")`. */
export function scenarioInfo(id: string): ScenarioInfo {
  return findScenario(id, listScenarios());
}

/** The absolute path of the `project/` of scenario `id`: the folder to run the CLI in. */
export function scenario(id: string): string {
  return scenarioInfo(id).project;
}

/** The absolute path of the folder of scenario `id`: holds `project/`, and maybe a `tsconfig.json` and type tests. */
export function scenarioFolder(id: string): string {
  return scenarioInfo(id).folder;
}
