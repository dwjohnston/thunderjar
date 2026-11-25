/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiApELUXheYNb6d7F3
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// What several commands' tests share about run data: a throwaway `--data-dir`, the key 0202's
// fake harness needs, and pointing a copied project at Postgres.
import { $ } from "bun";
import { TMP_DIR } from "./cli.ts";

/** What 0202's fake-harness-alpha needs: `run` stops without it. */
export const KEY = { FAKE_HARNESS_KEY: "fake-key" };

const dataDirs: string[] = [];
/** A fresh folder for `--data-dir`, removed by `removeDataDirs`. */
export const dataDir = () => {
  const dir = `${TMP_DIR}/data-${crypto.randomUUID()}`;
  dataDirs.push(dir);
  return dir;
};

/** Removes the folders `dataDir` made: call after each test. */
export async function removeDataDirs() {
  for (const dir of dataDirs.splice(0)) await $`rm -rf ${dir}`.quiet();
}

/** Points the config of the project in `dir` at a postgresStore, its URL in THUNDERJAR_DB_URL, its tables in `schema` if given. */
export async function usePostgres(dir: string, schema?: string) {
  const config = `${dir}/.thunderjar/thunderjar.config.ts`;
  const text = await Bun.file(config).text();
  await Bun.write(
    config,
    text
      .replace("import { declareConfig, sqliteStore }", "import { declareConfig, postgresStore }")
      .replace(/runDataStore: sqliteStore\(\{[^}]*\}\)/, `runDataStore: postgresStore({ urlEnv: "THUNDERJAR_DB_URL"${schema === undefined ? "" : `, schema: "${schema}"`} })`),
  );
}
