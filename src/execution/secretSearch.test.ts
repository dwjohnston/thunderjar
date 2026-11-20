/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLjTC1bzhycPs8knbmL
 * Supervising engineer: Claude
 *
 *
 * Humans: add your notes here
 *
 *
 */

// Searching a postrun image's files for a run's secret values, with the fake Docker in place of
// `docker`. Every value here is made up.
import { $ } from "bun";
import { afterEach, describe, expect, test } from "bun:test";
import { localRuntime } from "../docker/docker.ts";
import { TMP_DIR } from "../testing/cli.ts";
import { fakeDocker } from "../testing/fakeDocker.ts";
import { MIN_SECRET_LENGTH, parseSecretSearch, SECRET_PATHS_KEPT, searchableSecrets, searchForSecrets } from "./secretSearch.ts";

const A = "made-up-secret-value-a";
const B = "made-up-secret-value-b";

describe("searchableSecrets", () => {
  test("keeps each name once whose value is long enough and on one line, in order", () => {
    const env = { LONG: "x".repeat(MIN_SECRET_LENGTH), SHORT: "x".repeat(MIN_SECRET_LENGTH - 1), EMPTY: "", MULTI: `${"x".repeat(20)}\n${"y".repeat(20)}`, OTHER: A };
    expect(searchableSecrets(["OTHER", "LONG", "SHORT", "EMPTY", "UNSET", "MULTI", "LONG", "not-a-name"], { ...env, "not-a-name": A })).toEqual(["OTHER", "LONG"]);
  });
});

describe("parseSecretSearch", () => {
  test("groups the paths by name, in the order searched, sorted, and keeps the first SECRET_PATHS_KEPT with the count of all", () => {
    const many = Array.from({ length: SECRET_PATHS_KEPT + 5 }, (_, i) => `/tmp/log-${String(i).padStart(2, "0")}`);
    const text = [...many.map((path) => `B\t${path}`), "A\t/workspace/b", "A\t/workspace/a", "complete", ""].join("\n");

    expect(parseSecretSearch(text, ["A", "B", "C"])).toEqual([
      { name: "A", files: 2, paths: ["/workspace/a", "/workspace/b"] },
      { name: "B", files: SECRET_PATHS_KEPT + 5, paths: many.slice(0, SECRET_PATHS_KEPT) },
    ]);
  });

  test("nothing found is an empty list; no file, or one without its last line, is why it failed", () => {
    expect(parseSecretSearch("complete\n", ["A"])).toEqual([]);
    expect(parseSecretSearch(undefined, ["A"])).toBe("the search left no results");
    expect(parseSecretSearch("A\t/workspace/a\n", ["A"])).toBe("the search didn't finish");
  });
});

describe("searchForSecrets", () => {
  const names = ["TJ_TEST_SECRET_A", "TJ_TEST_SECRET_B", "TJ_TEST_SECRET_SHORT"];
  afterEach(() => {
    for (const name of [...names, "THUNDERJAR_DOCKER", "FAKE_DOCKER_DIR"]) delete Bun.env[name];
  });

  /** An image whose files are `files`, by path under /workspace or /thunderjar, built by the fake. */
  async function imageWith(files: Record<string, string>): Promise<string> {
    const context = `${TMP_DIR}/secret-search-${crypto.randomUUID()}`;
    const dockerfile = ["FROM scratch", ...Object.entries(files).flatMap(([path, text]) => [`COPY <<'EOF' ${path}`, text, "EOF"])].join("\n");
    await Bun.write(`${context}/Dockerfile`, `${dockerfile}\n`);
    await $`${Bun.env.THUNDERJAR_DOCKER as string} build -t tj-postrun:secrets ${context}`.quiet();
    await $`rm -rf ${context}`.quiet();
    return "tj-postrun:secrets";
  }

  test("finds each value by name, says nothing of one not found, and removes its container; no value is in a command", async () => {
    await using docker = await fakeDocker();
    Object.assign(Bun.env, docker.env, { TJ_TEST_SECRET_A: A, TJ_TEST_SECRET_B: B, TJ_TEST_SECRET_SHORT: "short" });
    const image = await imageWith({ "/workspace/.env": `KEY=${A}`, "/workspace/notes.md": "nothing here", "/thunderjar/session.jsonl": `{"key":"${A}"}` });

    const search = await searchForSecrets(image, "tj-run-1-secrets", names, localRuntime());

    expect(search).toEqual({ found: [{ name: "TJ_TEST_SECRET_A", files: 2, paths: ["/thunderjar/session.jsonl", "/workspace/.env"] }] });
    expect(await docker.containers()).toEqual([]);
    const commands = await docker.commands();
    expect(commands.find((command) => command.startsWith("docker run "))).toContain(
      " -e TJ_TEST_SECRET_A -e TJ_TEST_SECRET_B --user 0 --network none --entrypoint sh tj-postrun:secrets -c ",
    );
    for (const value of [A, B]) expect(commands.filter((command) => command.includes(value))).toEqual([]);
  });

  test("with no value worth searching for, runs nothing", async () => {
    await using docker = await fakeDocker();
    Object.assign(Bun.env, docker.env, { TJ_TEST_SECRET_SHORT: "short" });

    expect(await searchForSecrets("tj-postrun:secrets", "tj-run-1-secrets", names, localRuntime())).toBeUndefined();
    expect(await docker.commands()).toEqual([]);
  });

  test("a search that fails is `failed`, with Docker's reason, never thrown", async () => {
    await using docker = await fakeDocker();
    Object.assign(Bun.env, docker.env, { TJ_TEST_SECRET_A: A });

    expect(await searchForSecrets("tj-postrun:missing", "tj-run-1-secrets", names, localRuntime())).toEqual({
      failed: "docker: Error response from daemon: No such image: tj-postrun:missing",
    });
    expect(await docker.containers()).toEqual([]);
  });
});
