#!/usr/bin/env bun
// Turns the layers in scripts/layers.ts into the "overrides" of .oxlintrc.json.
//
//   bun scripts/lint-layers.ts           rewrite .oxlintrc.json
//   bun scripts/lint-layers.ts --check   fail if .oxlintrc.json is out of date, or a folder in src/ is not a layer
import { file, write } from "bun";
import { LAYERS } from "./layers.ts";

const REPO_ROOT = Bun.fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const CONFIG_FILE = ".oxlintrc.json";

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
 * One override per layer and folder depth, banning imports from the layers after it.
 *
 * Overrides replace the top-level rule rather than adding to it, so each one repeats the
 * top-level no-restricted-imports options.
 */
export function generateOverrides(layers: readonly string[], depth: number, base: RestrictedImportsOptions = {}): Override[] {
  const overrides: Override[] = [];
  layers.forEach((layer, i) => {
    const later = layers.slice(i + 1);
    if (later.length === 0) return;
    for (let d = 1; d <= depth; d++) {
      const up = escapeRegex("../".repeat(d));
      const patterns = later.map((other) => ({
        regex: `^${up}${escapeRegex(other)}(/|$)`,
        message: `src/${layer} may not import from src/${other}: a layer may only import from the layers before it. See scripts/layers.ts.`,
      }));
      overrides.push({
        files: [`src/${layer}/${"*/".repeat(d - 1)}*`],
        rules: { "no-restricted-imports": ["error", { ...base, patterns: [...(base.patterns ?? []), ...patterns] }] },
      });
    }
  });
  return overrides;
}

/** `config` with its overrides generated from `layers`. */
export function applyLayers(config: OxlintConfig, layers: readonly string[], srcFiles: string[]): OxlintConfig {
  const rule = config.rules?.["no-restricted-imports"];
  const base = Array.isArray(rule) ? ((rule[1] ?? {}) as RestrictedImportsOptions) : {};
  return { ...config, overrides: generateOverrides(layers, maxDepth(srcFiles), base) };
}

export const renderConfig = (config: OxlintConfig) => `${JSON.stringify(config, null, 2)}\n`;

if (import.meta.main) {
  const srcFiles = await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: `${REPO_ROOT}/src` }));
  const undeclared = undeclaredFolders(srcFiles, LAYERS);
  if (undeclared.length > 0) {
    console.error(undeclared.map((f) => `src/${f} is not a layer. Add it to scripts/layers.ts.`).join("\n"));
    process.exit(1);
  }

  const configFile = file(`${REPO_ROOT}/${CONFIG_FILE}`);
  const before = await configFile.text();
  const after = renderConfig(applyLayers(JSON.parse(before), LAYERS, srcFiles));
  if (process.argv.includes("--check")) {
    if (after !== before) {
      console.error(`${CONFIG_FILE} is out of date with scripts/layers.ts. Run \`bun run lint:generate\`.`);
      process.exit(1);
    }
  } else if (after !== before) {
    await write(configFile, after);
    console.log(`updated ${CONFIG_FILE}`);
  }
}
