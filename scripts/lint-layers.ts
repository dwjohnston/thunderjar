#!/usr/bin/env bun
// Turns the layers in scripts/layers.ts into the "overrides" of .oxlintrc.json.
//
//   bun scripts/lint-layers.ts           rewrite .oxlintrc.json
//   bun scripts/lint-layers.ts --check   fail if .oxlintrc.json is out of date, a folder in src/ is not a layer,
//                                        or scripts/ambientAllowlist.ts lists a ban a file no longer breaks
//   bun scripts/lint-layers.ts --seed-allowlist   rewrite scripts/ambientAllowlist.ts from what oxlint finds
//
// It also writes the overrides that ban ambient APIs in src/: see scripts/ambient.ts.
//
// Folders in NOT_LAYERS, e.g. src/gauntlet, are skipped.
import { $, file, write } from "bun";
import {
  AMBIENT_BANS,
  AMBIENT_EXEMPT,
  AMBIENT_IMPLEMENTATIONS,
  ambientOverrides,
  mergeAllowlists,
  offenders,
  renderAllowlist,
  staleEntries,
  type Allowlist,
  type Ban,
} from "./ambient.ts";
import { AMBIENT_ALLOWLIST } from "./ambientAllowlist.ts";
import { LAYERS, NOT_LAYERS, SRC_RULES, TEST_LAYERS } from "./layers.ts";

const REPO_ROOT = Bun.fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const CONFIG_FILE = ".oxlintrc.json";
const ALLOWLIST_FILE = "scripts/ambientAllowlist.ts";

type RestrictedImportsOptions = { patterns?: unknown[]; [key: string]: unknown };
export type Override = { files: string[]; rules: Record<string, unknown> };
export type OxlintConfig = { rules?: Record<string, unknown>; overrides?: Override[]; [key: string]: unknown };

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** How many folders below src/ the deepest file sits, e.g. 3 for src/cli/commands/init/init.ts. */
export function maxDepth(srcFiles: string[]): number {
  return Math.max(0, ...srcFiles.map((f) => f.split("/").length - 1));
}

/** Top-level folders of src/ that hold files but are not layers. */
export function undeclaredFolders(srcFiles: string[], layers: readonly string[]): string[] {
  const folders = srcFiles.filter((f) => f.includes("/")).map((f) => f.split("/")[0]!);
  return [...new Set(folders)].filter((folder) => !layers.includes(folder)).sort();
}

/**
 * One override per layer and folder depth, banning imports from the layers after it. Where one of
 * those is in `testLayers`, a second override follows for the tests at that depth, which may
 * import it.
 *
 * Overrides replace the top-level rule rather than adding to it, so each one repeats the
 * top-level no-restricted-imports options. Of two that match a file, oxlint applies the later.
 */
export function generateOverrides(layers: readonly string[], depth: number, base: RestrictedImportsOptions = {}, testLayers: readonly string[] = []): Override[] {
  const overrides: Override[] = [];
  const rule = (patterns: { regex: string; message: string }[]) => ({
    "no-restricted-imports": ["error", { ...base, patterns: [...(base.patterns ?? []), ...patterns] }],
  });
  layers.forEach((layer, i) => {
    const later = layers.slice(i + 1);
    if (later.length === 0) return;
    for (let d = 1; d <= depth; d++) {
      const up = escapeRegex("../".repeat(d));
      const ban = (other: string) => ({
        regex: `^${up}${escapeRegex(other)}(/|$)`,
        message: `src/${layer} may not import from src/${other}: a layer may only import from the layers before it. See scripts/layers.ts.`,
      });
      const folder = `src/${layer}/${"*/".repeat(d - 1)}`;
      overrides.push({ files: [`${folder}*`], rules: rule(later.map(ban)) });
      if (later.some((other) => testLayers.includes(other))) {
        overrides.push({ files: [`${folder}*.test.ts`, `${folder}*.test.tsx`], rules: rule(later.filter((other) => !testLayers.includes(other)).map(ban)) });
      }
    }
  });
  return overrides;
}

export type Ambient = { bans: readonly Ban[]; exempt: readonly string[]; allowlist: Allowlist };

/**
 * `config` with its overrides generated from `layers`, after one applying `srcRules` to every file
 * in src/, if there are any, and followed by those banning the `ambient` APIs, if given.
 */
export function applyLayers(
  config: OxlintConfig,
  layers: readonly string[],
  srcFiles: string[],
  srcRules: Readonly<Record<string, unknown>> = {},
  ambient?: Ambient,
  testLayers: readonly string[] = [],
): OxlintConfig {
  const rule = config.rules?.["no-restricted-imports"];
  const base = Array.isArray(rule) ? ((rule[1] ?? {}) as RestrictedImportsOptions) : {};
  const src = Object.keys(srcRules).length > 0 ? [{ files: ["src/**"], rules: { ...srcRules } }] : [];
  const bans = ambient ? ambientOverrides(ambient.bans, ambient.exempt, ambient.allowlist) : [];
  return { ...config, overrides: [...src, ...generateOverrides(layers, maxDepth(srcFiles), base, testLayers), ...bans] };
}

/**
 * The bans each file in src/ breaks, linting with `config` minus its allowlist. The services' real
 * implementations, in AMBIENT_IMPLEMENTATIONS, stay allowed, so they're never offenders.
 */
async function findOffenders(config: OxlintConfig, layers: readonly string[], srcFiles: string[]): Promise<Allowlist> {
  const unrelaxed = applyLayers(config, layers, srcFiles, SRC_RULES, { bans: AMBIENT_BANS, exempt: AMBIENT_EXEMPT, allowlist: AMBIENT_IMPLEMENTATIONS }, TEST_LAYERS);
  // Override globs are relative to the config file, so it goes beside .oxlintrc.json.
  const tmp = file(`${REPO_ROOT}/.oxlintrc.no-allowlist.tmp.json`);
  await write(tmp, renderConfig(unrelaxed));
  try {
    const { stdout } = await $`${REPO_ROOT}/node_modules/.bin/oxlint -c ${tmp.name} --format json src`.cwd(REPO_ROOT).nothrow().quiet();
    return offenders(JSON.parse(stdout.toString()).diagnostics, AMBIENT_BANS);
  } finally {
    await tmp.delete();
  }
}

/**
 * `config` as JSON, with each object of plain values on one line, e.g. a rule's
 * `{ "object": "Date", "property": "now", "message": "…" }`, so the file stays short.
 */
export const renderConfig = (config: OxlintConfig) => `${render(config, "")}\n`;

function render(value: unknown, indent: string): string {
  const isLeaf = (v: unknown) => v === null || typeof v !== "object";
  if (isLeaf(value)) return JSON.stringify(value);
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[\n${value.map((v) => `${inner}${render(v, inner)}`).join(",\n")}\n${indent}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return "{}";
  if (entries.every(([, v]) => isLeaf(v))) return `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(", ")} }`;
  return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${render(v, inner)}`).join(",\n")}\n${indent}}`;
}

if (import.meta.main) {
  const allSrcFiles = await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: `${REPO_ROOT}/src` }));
  const srcFiles = allSrcFiles.filter((f) => !NOT_LAYERS.includes(f.split("/")[0]!));
  const undeclared = undeclaredFolders(srcFiles, LAYERS);
  if (undeclared.length > 0) {
    console.error(undeclared.map((f) => `src/${f} is not a layer. Add it to scripts/layers.ts.`).join("\n"));
    process.exit(1);
  }

  const configFile = file(`${REPO_ROOT}/${CONFIG_FILE}`);
  const before = await configFile.text();
  const ambient = { bans: AMBIENT_BANS, exempt: AMBIENT_EXEMPT, allowlist: mergeAllowlists(AMBIENT_ALLOWLIST, AMBIENT_IMPLEMENTATIONS) };
  const after = renderConfig(applyLayers(JSON.parse(before), LAYERS, srcFiles, SRC_RULES, ambient, TEST_LAYERS));
  if (process.argv.includes("--seed-allowlist")) {
    await write(`${REPO_ROOT}/${ALLOWLIST_FILE}`, renderAllowlist(await findOffenders(JSON.parse(before), LAYERS, srcFiles)));
    console.log(`updated ${ALLOWLIST_FILE}. Run \`bun run lint:generate\`.`);
  } else if (process.argv.includes("--check")) {
    if (after !== before) {
      console.error(`${CONFIG_FILE} is out of date with scripts/layers.ts or ${ALLOWLIST_FILE}. Run \`bun run lint:generate\`.`);
      process.exit(1);
    }
    const stale = staleEntries(AMBIENT_ALLOWLIST, await findOffenders(JSON.parse(before), LAYERS, srcFiles));
    if (stale.length > 0) {
      console.error(
        [`${ALLOWLIST_FILE} allows bans these files no longer break. Delete them, then run \`bun run lint:generate\`:`, ...stale.map((s) => `  ${s}`)].join("\n"),
      );
      process.exit(1);
    }
  } else if (after !== before) {
    await write(configFile, after);
    console.log(`updated ${CONFIG_FILE}`);
  }
}
