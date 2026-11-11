/**
 * The layers of src/, lowest first: one per top-level folder.
 *
 * A file may import from its own layer and the layers before it, never from one after it.
 * Add a layer when its first module arrives, then run `bun run lint:generate`.
 */
export const LAYERS: readonly string[] = ["log", "testing", "api", "instruments", "config", "docker", "store", "execution", "cli"];

/**
 * oxlint rules for src/ only, on top of the top-level ones in .oxlintrc.json. `bun run lint:generate`
 * writes them into its overrides.
 *
 * `no-console`: a command writes its output with src/cli/output.ts, and diagnostics with the
 * logger in src/log/logger.ts. The scripts in scripts/ may still use `console`.
 */
export const SRC_RULES: Readonly<Record<string, unknown>> = { "no-console": "error" };
