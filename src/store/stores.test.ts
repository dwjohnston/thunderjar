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

import { $ } from "bun";
import { afterEach, describe, expect, test } from "bun:test";
import { ConfigError } from "../config/loader.ts";
import { FakeEnv } from "../services/Env/FakeEnv.ts";
import { TMP_DIR } from "../testing/cli.ts";
import { scenario } from "../testing/scenario.ts";
import { createStores, openStoreIn, resolvePath } from "./stores.ts";

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await $`rm -rf ${dir}`.quiet();
});

/** A project whose config's run data store is `runDataStore`, source text. */
async function projectWith(runDataStore: string): Promise<string> {
  const dir = `${TMP_DIR}/stores-${crypto.randomUUID()}`;
  dirs.push(dir);
  await Bun.write(
    `${dir}/.thunderjar/thunderjar.config.ts`,
    `import { declareConfig, postgresStore, sqliteStore } from "thunderjar";\nexport default declareConfig({ imageStore: null, runDataStore: ${runDataStore} });\n`,
  );
  return dir;
}

describe(resolvePath, () => {
  test("resolves against the folder, dropping . and .. and a trailing slash; an absolute path stays", () => {
    expect(resolvePath("/a/b", "c/./d/")).toBe("/a/b/c/d");
    expect(resolvePath("/a/b", "../c")).toBe("/a/c");
    expect(resolvePath("/a/b", "/x/y")).toBe("/x/y");
  });
});

describe(createStores, () => {
  test("a data dir is its runs.sqlite, resolved against the cwd, with no project needed", async () => {
    const stores = createStores(FakeEnv({ cwd: "/nowhere/at/all" }));
    expect((await stores.open("../data")).where).toBe("/nowhere/at/data/runs.sqlite");
    expect((await stores.open("/abs/data")).where).toBe("/abs/data/runs.sqlite");
  });

  test("with no data dir, the config's SQLite file, resolved against the project folder, found from a folder inside it", async () => {
    // A throwaway project, not a shared scenario: a `run` there by hand leaves a store file git doesn't show.
    const project = await projectWith(`sqliteStore({ path: "./.thunderjar/.data/runs.sqlite" })`);
    await $`mkdir -p ${project}/.thunderjar/parameters`.quiet();
    const { store, where } = await createStores(FakeEnv({ cwd: `${project}/.thunderjar/parameters` })).open();
    expect(where).toBe(`${project}/.thunderjar/.data/runs.sqlite`);
    // Reading a store with no file gives nothing, and creates nothing.
    expect(await store.listExecutions()).toEqual([]);
    expect(await Bun.file(where).exists()).toBe(false);
  });

  test("opens a store that records and reads back", async () => {
    const dir = await projectWith(`sqliteStore({ path: "./data/runs.sqlite" })`);
    const { store, where } = await createStores(FakeEnv({ cwd: dir })).open();
    expect(where).toBe(`${dir}/data/runs.sqlite`);
    const record = { executionId: "01a", testCase: "example", task: "sums", startedAt: "2026-11-01T02:00:00.000Z", status: "running" as const, matrix: { shape: [1, 1, 1, 1, 1], permutations: 1, iterations: 1 } };
    await store.recordExecution(record);
    expect(await store.listExecutions()).toEqual([record]);
  });

  test("outside a project, with no data dir, is a ConfigError", async () => {
    expect(createStores(FakeEnv({ cwd: "/" })).open()).rejects.toBeInstanceOf(ConfigError);
  });

  test("a Postgres store takes its URL from the Env's variables, never the process's, and is named by the variable", async () => {
    const dir = await projectWith(`postgresStore({ urlEnv: "STORES_TEST_DB_URL" })`);
    const { where } = await createStores(FakeEnv({ cwd: dir, variables: { STORES_TEST_DB_URL: "postgres://user:secret@localhost:1/db" } })).open();
    expect(where).toBe("Postgres at $STORES_TEST_DB_URL");
  });

  test("a Postgres store whose variable is unset is a ConfigError naming it", async () => {
    const dir = await projectWith(`postgresStore({ urlEnv: "STORES_TEST_DB_URL" })`);
    const error = await createStores(FakeEnv({ cwd: dir })).open().catch((e) => e);
    expect(error).toBeInstanceOf(ConfigError);
    expect(error.message).toContain("STORES_TEST_DB_URL, which is not set");
  });
});

describe(openStoreIn, () => {
  test("takes the .thunderjar folder if the caller already found it", async () => {
    const project = scenario("0202");
    const { where } = await openStoreIn({ cwd: "/somewhere/else", variables: {} }, undefined, `${project}/.thunderjar`);
    expect(where).toBe(`${project}/.thunderjar/.data/runs.sqlite`);
  });
});
