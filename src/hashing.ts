// Parameter and permutation hashes — spec/060-test-case-parameters.md#parameter-hashing-and-identity
// and spec/064-harness.md#hashing. A hash is derived from content, never from a name: renaming
// a folder, file or map key keeps it, editing what runs changes it.
//
// Hashes are full SHA-256 hex digests. Display and image tags use the first 8 characters
// (spec/081-docker-tagging.md#tag-formats); comparisons should use the full hash.
//
// `additionalHash` and `determineHash` (floating parameters) are not applied yet.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const sha256 = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");

/**
 * A stable string for a value: object keys sorted, functions as their source. JSON.stringify
 * alone would depend on key order and drop functions.
 */
function canonical(value: unknown): string {
  if (typeof value === "function") return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const keys = Object.keys(value).toSorted();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

const hashValue = (value: unknown) => sha256(canonical(value));

/** The abbreviated hash shown by `plan` and carried in image tags. */
export const abbreviateHash = (hash: string) => hash.slice(0, 8);

/** Every file under `dir`, as `/`-separated paths relative to it, sorted. */
function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"))
    .toSorted();
}

/**
 * Hashes a folder's content: each file's path relative to the folder, and its bytes. The
 * folder's own name and location are not part of it. `exclude` lists relative paths to leave out.
 */
function hashFolder(dir: string, exclude: string[] = []): string {
  const files = listFiles(dir).filter((file) => !exclude.includes(file));
  return hashValue(files.map((file) => [file, sha256(readFileSync(join(dir, file)))]));
}

/** `baseImages/<name>/` — index.ts and everything bundled beside it. */
export const hashBaseImage = (path: string) => hashFolder(path);

/** `codeStates/<name>/` — index.ts and everything bundled beside it. */
export const hashCodeState = (path: string) => hashFolder(path);

/** `promptSets/<name>/` — index.ts and everything bundled beside it. */
export const hashPromptSet = (path: string) => hashFolder(path);

/**
 * `tasks/<task>/initial-prompts/<name>.ts` — the file's content alone. The task's
 * `measurements/` never contributes (spec/066-task.md#excluded-from-every-parameter-hash).
 */
export const hashInitialPrompt = (path: string) => sha256(readFileSync(path));

/**
 * The family files Thunderjar loads separately. They are excluded from the shared execution
 * content by location; only the selected entries' resolved values contribute.
 */
const FAMILY_MAP_FILES = ["models.ts", "versions.ts", "collectTokenCosts.ts"];

const EXECUTION_OVERRIDES = ["applyParameter", "cli", "requiredEnv"] as const;

/** Imports `file`'s default export, a map keyed by name. */
async function loadMap(file: string): Promise<Record<string, unknown>> {
  const module = (await import(file)) as { default?: Record<string, unknown> };
  return module.default ?? {};
}

/**
 * The hash of the pair `<family>@<version>/<model>`, where `family` is the family folder
 * (`harnessModels/<family>/`) and `version` and `model` are keys in its maps. Combines:
 *
 * 1. shared execution content: the family folder, less models.ts, versions.ts and
 *    collectTokenCosts.ts;
 * 2. the selected version's resolved version and execution overrides;
 * 3. the selected model's resolved ID.
 *
 * Other map entries and the keys themselves do not contribute.
 */
export async function hashHarnessModelPair(family: string, version: string, model: string): Promise<string> {
  const versions = await loadMap(join(family, "versions.ts"));
  const models = await loadMap(join(family, "models.ts"));

  if (!Object.hasOwn(versions, version)) throw new Error(`version "${version}" is not in ${family}/versions.ts`);
  if (!Object.hasOwn(models, model)) throw new Error(`model "${model}" is not in ${family}/models.ts`);
  const entry = versions[version] as Record<string, unknown>;
  if (typeof entry.version !== "string") {
    throw new Error(`version "${version}" in ${family}/versions.ts has no pinned version; floating versions are not supported yet`);
  }

  const overrides = Object.fromEntries(EXECUTION_OVERRIDES.filter((k) => k in entry).map((k) => [k, entry[k]]));

  return hashValue({
    shared: hashFolder(family, FAMILY_MAP_FILES),
    version: entry.version,
    overrides,
    modelId: models[model],
  });
}

/** The parameter hashes of one permutation's five parameters. */
export interface PermutationHashes {
  baseImage: string;
  codeState: string;
  promptSet: string;
  harnessModel: string;
  initialPrompt: string;
}

/** The permutation hash: the five parameter hashes combined, each by its role. */
export const hashPermutation = (hashes: PermutationHashes) => hashValue(hashes);

/**
 * A measurement's content hash — spec/085-test-case-results.md#name-is-identity-hash-is-version.
 * Covers `instrument` and `config` only: not the measurement's name, so renaming its file keeps
 * it, and not `aggregate`, so changing how values combine never makes a measure stale. Bundled
 * files, such as a `templateTest` template, are not covered yet.
 */
export const hashMeasurement = ({ instrument, config }: { instrument: string; config: unknown }) =>
  hashValue({ instrument, config });
