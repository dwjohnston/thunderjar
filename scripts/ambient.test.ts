/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLi84J7b2Ykdumve3HN
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */

import { afterAll, describe, expect, test } from "bun:test";
import { $, write } from "bun";
import {
  AMBIENT_BANS,
  AMBIENT_EXEMPT,
  ambientOverrides,
  ambientRules,
  banOf,
  offenders,
  renderAllowlist,
  staleEntries,
  type Ban,
} from "./ambient.ts";
import { applyLayers, renderConfig } from "./lint-layers.ts";
import { LAYERS, SRC_RULES } from "./layers.ts";

const REPO_ROOT = Bun.fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");

const NOW: Ban = { id: "Date.now", kind: "property", message: "Use the Clock service instead." };
const TIMEOUT: Ban = { id: "setTimeout", kind: "global", message: "Use the Clock service instead." };
const SPAWN: Ban = { id: "Bun.spawn", kind: "property", message: "Use a service." };
const DATE: Ban = { id: "new Date()", kind: "date", message: "Use the Clock service instead." };

describe("ambientRules", () => {
  test("gives each kind of ban to the rule that finds it", () => {
    expect(ambientRules([NOW, TIMEOUT, SPAWN, DATE])).toEqual({
      "no-restricted-globals": ["error", { name: "setTimeout", message: TIMEOUT.message }],
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now", message: NOW.message },
        { object: "Bun", property: "spawn", message: SPAWN.message },
      ],
      // Bun.spawn is also `import { spawn } from "bun"`.
      "thunderjar/no-ambient": ["error", { bans: [SPAWN, DATE] }],
    });
  });

  test("turns off a rule with nothing to ban", () => {
    expect(ambientRules([NOW])).toMatchObject({ "no-restricted-globals": "off", "thunderjar/no-ambient": "off" });
  });
});

describe("ambientOverrides", () => {
  const overrides = ambientOverrides([NOW, TIMEOUT], ["src/**/*.test.ts"], { "src/b.ts": ["setTimeout"], "src/a.ts": ["Date.now"] });

  test("bans everything in src/, then turns the bans off for the exempt files", () => {
    expect(overrides[0]).toEqual({ files: ["src/**"], rules: ambientRules([NOW, TIMEOUT]) });
    expect(overrides[1]).toEqual({
      files: ["src/**/*.test.ts"],
      rules: { "no-restricted-globals": "off", "no-restricted-properties": "off", "thunderjar/no-ambient": "off" },
    });
  });

  test("relaxes, per allowlisted file, only the rules it needs, keeping their other bans", () => {
    expect(overrides.slice(2)).toEqual([
      { files: ["src/a.ts"], rules: { "no-restricted-properties": "off" } },
      { files: ["src/b.ts"], rules: { "no-restricted-globals": "off" } },
    ]);
    const relaxed = ambientOverrides([NOW, SPAWN], [], { "src/a.ts": ["Date.now"] }).at(-1);
    expect(relaxed!.rules).toEqual({
      "no-restricted-properties": ["error", { object: "Bun", property: "spawn", message: SPAWN.message }],
    });
  });
});

describe("offenders", () => {
  const diagnostics = [
    { filename: "src/b.ts", code: "eslint(no-restricted-globals)", message: "Unexpected use of 'setTimeout'. Use the Clock service instead." },
    { filename: "src/a.ts", code: "eslint(no-restricted-properties)", message: "'Date.now' is restricted from being used." },
    { filename: "src/a.ts", code: "thunderjar(no-ambient)", message: "'new Date()' is restricted. Use the Clock service instead." },
    { filename: "src/a.ts", code: "eslint(no-restricted-properties)", message: "'Date.now' is restricted from being used." },
    { filename: "src/a.ts", code: "eslint(no-restricted-properties)", message: "'Foo.bar' is restricted from being used." },
    { filename: "src/c.ts", code: "eslint(eqeqeq)", message: "'Date.now' is not a ban here." },
  ];

  test("lists the bans each file breaks, once each, in the bans' order", () => {
    expect(offenders(diagnostics, [NOW, TIMEOUT, DATE])).toEqual({ "src/a.ts": ["Date.now", "new Date()"], "src/b.ts": ["setTimeout"] });
  });

  test("ignores diagnostics that aren't a ban", () => {
    expect(banOf(diagnostics[4]!, [NOW])).toBeUndefined();
    expect(banOf(diagnostics[5]!, [NOW])).toBeUndefined();
  });
});

describe("staleEntries", () => {
  test("lists the bans a file is allowed but no longer breaks", () => {
    const allowlist = { "src/a.ts": ["Date.now", "setTimeout"], "src/gone.ts": ["Date.now"] };
    expect(staleEntries(allowlist, { "src/a.ts": ["Date.now"], "src/new.ts": ["Date.now"] })).toEqual([
      "src/a.ts: setTimeout",
      "src/gone.ts: Date.now",
    ]);
  });
});

describe("renderAllowlist", () => {
  test("renders a module that exports the allowlist", async () => {
    const path = `${REPO_ROOT}/fixtures/.tmp/ambientAllowlist-${crypto.randomUUID()}.ts`;
    await write(path, renderAllowlist({ "src/a.ts": ["Date.now", "new Date()"] }).replace("./ambient.ts", `${REPO_ROOT}/scripts/ambient.ts`));
    expect((await import(path)).AMBIENT_ALLOWLIST).toEqual({ "src/a.ts": ["Date.now", "new Date()"] });
    await $`rm -f ${path}`;
  });
});

// Proves the generated config does what it says, with the real oxlint: every ban fires, an
// allowlist entry relaxes only its own ban, and exempt files are exempt.
describe("oxlint, with the generated config", () => {
  const dir = `${REPO_ROOT}/fixtures/.tmp/ambient-lint-${crypto.randomUUID()}`;
  afterAll(async () => {
    await $`rm -rf ${dir}`;
  });

  const EVERY_BAN = `import { $, sleep, spawn, which } from "bun";
import { Database } from "bun:sqlite";
export function f() {
  Date.now(); new Date(); performance.now(); Bun.nanoseconds(); Bun.sleep(1); Bun.sleepSync(1);
  setTimeout(() => {}, 1); setInterval(() => {}, 1);
  Math.random(); crypto.randomUUID(); crypto.getRandomValues(new Uint8Array(1)); Bun.randomUUIDv7();
  const { env } = process; process.cwd(); Bun.env.X; process.argv.at(0);
  process.stdout.write(""); process.stderr.write(""); process.stdin.read(); Bun.stdin.text(); Bun.stdout.size; Bun.stderr.size;
  process.on("SIGINT", () => {}); process.once("SIGINT", () => {}); process.exit(1);
  Bun.spawn(["x"]); Bun.spawnSync(["x"]); Bun.$\`x\`; fetch("x"); Bun.serve({ fetch: () => new Response() }); Bun.which("x"); Bun.SQL.name;
  return [env, $, sleep, spawn, which, Database, new Date(0)];
}
`;

  async function lint(files: Record<string, string>, allowlist: Record<string, string[]> = {}) {
    const project = `${dir}/${crypto.randomUUID()}`;
    for (const [path, text] of Object.entries(files)) await write(`${project}/${path}`, text);
    const config = applyLayers(await Bun.file(`${REPO_ROOT}/.oxlintrc.json`).json(), LAYERS, [], SRC_RULES, {
      bans: AMBIENT_BANS,
      exempt: AMBIENT_EXEMPT,
      allowlist,
    });
    config.jsPlugins = [`${REPO_ROOT}/scripts/oxlint-plugin.ts`];
    await write(`${project}/.oxlintrc.json`, renderConfig(config));
    // By path: oxlint skips a folder it's given inside a hidden one, e.g. fixtures/.tmp.
    const { stdout } = await $`${REPO_ROOT}/node_modules/.bin/oxlint -c .oxlintrc.json --format json ${Object.keys(files)}`.cwd(project).nothrow().quiet();
    return offenders(JSON.parse(stdout.toString()).diagnostics, AMBIENT_BANS);
  }

  test("reports every ban, in a file in src/", async () => {
    const found = await lint({ "src/cli/a.ts": EVERY_BAN });
    expect(found["src/cli/a.ts"]).toEqual(AMBIENT_BANS.map((b) => b.id));
  });

  test("relaxes only the bans an allowlisted file may break", async () => {
    const found = await lint({ "src/cli/a.ts": EVERY_BAN }, { "src/cli/a.ts": ["Date.now", "setTimeout", "Bun.$", "new Date()"] });
    expect(found["src/cli/a.ts"]).toEqual(AMBIENT_BANS.map((b) => b.id).filter((id) => !["Date.now", "setTimeout", "Bun.$", "new Date()"].includes(id)));
  });

  test("exempts tests and src/testing", async () => {
    const found = await lint({ "src/cli/a.test.ts": EVERY_BAN, "src/testing/a.ts": EVERY_BAN });
    expect(found).toEqual({});
  });
});
