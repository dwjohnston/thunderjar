/**
 * The layers of src/, lowest first: one per top-level folder.
 *
 * A file may import from its own layer and the layers before it, never from one after it.
 * Add a layer when its first module arrives, then run `bun run lint:generate`.
 */
export const LAYERS: readonly string[] = ["log", "testing", "api", "instruments", "config", "docker", "store", "execution", "cli"];

/**
 * Top-level folders of src/ that are not Thunderjar code, so not layers. oxlint ignores them, in
 * the `ignorePatterns` of .oxlintrc.json, and `bun test` does, in bunfig.toml.
 *
 * `gauntlet`: challenges that Thunderjar's own experiments set agents, one folder each. Each is a
 * small project of its own, run with its own tools, e.g. `node --test`, and may fail on purpose.
 */
export const NOT_LAYERS: readonly string[] = ["gauntlet"];

/**
 * oxlint rules for src/ only, on top of the top-level ones in .oxlintrc.json. `bun run lint:generate`
 * writes them into its overrides.
 *
 * `no-console`: a command writes its output with src/cli/output.ts, and diagnostics with the
 * logger in src/log/logger.ts. The scripts in scripts/ may still use `console`.
 */
export const SRC_RULES: Readonly<Record<string, unknown>> = { "no-console": "error" };
