// `thunderjar executions`, through the CLI. It only reads the store, so it runs on the scenarios
// unchanged: 0203 has a run data store checked in, of four executions. Stores that are empty or
// corrupt are made in a temporary `--data-dir`, never in a scenario. Any of these can be run by
// hand, e.g. `bun run fixture 0203 executions two-harnesses`.
import { afterEach, describe, expect, test } from "bun:test";
import { $ } from "bun";
import { Database } from "bun:sqlite";
import { copyScenarioProject, TMP_DIR, thunderjar } from "../../../testing/cli.ts";
import { scenario } from "../../../testing/scenario.ts";

const dirs: string[] = [];

/** A fresh folder for `--data-dir`, removed after the test. */
const dataDir = () => {
  const dir = `${TMP_DIR}/data-${crypto.randomUUID()}`;
  dirs.push(dir);
  return dir;
};

afterEach(async () => {
  for (const dir of dirs.splice(0)) await $`rm -rf ${dir}`.quiet();
});

describe("0203 recorded executions", () => {
  test("every execution, newest first, with its test case, when it started, its matrix and its status", async () => {
    expect(await thunderjar(scenario("0203"), ["executions"])).toEqual({
      stdout: `<ULID>  two-harnesses      2026-10-04 08:30  2 permutations × 1 iteration   failed
<ULID>  example            2026-10-03 09:05  1 permutation × 1 iteration    running
<ULID>  two-harnesses      2026-10-02 14:40  2 permutations × 1 iteration   failed
<ULID>  is-prime-baseline  2026-10-01 10:12  8 permutations × 5 iterations  complete
`,
      stderr: "",
      exitCode: 0,
    });
  });

  test("lists the store's execution IDs", async () => {
    const { stdout } = await $`bun ${import.meta.dir}/../../index.ts --log-level silent executions`.cwd(scenario("0203")).quiet();

    expect(stdout.toString().match(/^\w{26}/gm)).toEqual([
      "01m430hgt00w0g80g80m3g2102",
      "01m40g5972dza3k7g3d36k55zw",
      "01m3ygz4g89aqh8yey8em0twpq",
      "01m3vf68s54p5eyn5s3t1ygkdj",
    ]);
  });

  test("<test case>: only that test case's executions", async () => {
    expect(await thunderjar(scenario("0203"), ["executions", "two-harnesses"])).toEqual({
      stdout: "<ULID>  two-harnesses  2026-10-04 08:30  2 permutations × 1 iteration  failed\n<ULID>  two-harnesses  2026-10-02 14:40  2 permutations × 1 iteration  failed\n",
      stderr: "",
      exitCode: 0,
    });
  });

  test("<test case> with nothing recorded says so", async () => {
    expect(await thunderjar(scenario("0203"), ["executions", "nope"])).toEqual({
      stdout: "No executions of nope recorded.\n",
      stderr: "",
      exitCode: 0,
    });
  });

  test("--data-dir reads the store there instead, which is empty if it doesn't exist", async () => {
    expect(await thunderjar(scenario("0203"), ["executions", "--data-dir", dataDir()])).toEqual({
      stdout: "No executions recorded.\n",
      stderr: "",
      exitCode: 0,
    });
  });

  test("--data-dir reads a store outside any project", async () => {
    const store = `${scenario("0203")}/.thunderjar/.data`;

    expect(await thunderjar(TMP_DIR, ["executions", "two-harnesses", "--data-dir", store])).toEqual({
      stdout: "<ULID>  two-harnesses  2026-10-04 08:30  2 permutations × 1 iteration  failed\n<ULID>  two-harnesses  2026-10-02 14:40  2 permutations × 1 iteration  failed\n",
      stderr: "",
      exitCode: 0,
    });
  });

  test("without --data-dir, the store is the config's runDataStore, relative to the project folder", async () => {
    await using copy = await copyScenarioProject("0203");
    await $`mkdir -p ${copy.dir}/elsewhere && mv ${copy.dir}/.thunderjar/.data/runs.sqlite ${copy.dir}/elsewhere/store.sqlite`.quiet();
    const config = `${copy.dir}/.thunderjar/thunderjar.config.ts`;
    await Bun.write(config, (await Bun.file(config).text()).replace("./.thunderjar/.data/runs.sqlite", "./elsewhere/store.sqlite"));

    const { stdout, exitCode } = await thunderjar(`${copy.dir}/.thunderjar`, ["executions", "example"]);
    expect(stdout).toBe("<ULID>  example  2026-10-03 09:05  1 permutation × 1 iteration  running\n");
    expect(exitCode).toBe(0);
  });

  test("a record that isn't JSON is an error naming the store and the record", async () => {
    const data = dataDir();
    await $`mkdir -p ${data} && cp ${scenario("0203")}/.thunderjar/.data/runs.sqlite ${data}/`.quiet();
    const db = new Database(`${data}/runs.sqlite`);
    db.run(`UPDATE executions SET record = '{ "executionId": ' WHERE execution_id = '01m3ygz4g89aqh8yey8em0twpq'`);
    db.close();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0203"), ["executions", "--data-dir", data], {
      paths: { "<DATA>": data },
    });

    expect(stdout).toBe("");
    expect(stderr).toMatch(/^Error: Can't read <DATA>\/runs\.sqlite: execution <ULID>: .+\n$/);
    expect(exitCode).toBe(1);
  });

  test("extra arguments are a usage error", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0203"), ["executions", "a", "b"]);

    expect(stdout).toBe("");
    expect(stderr).toBe("error: too many arguments for 'executions'. Expected 1 argument but got 2: a, b.\n");
    expect(exitCode).toBe(1);
  });
});

describe("0101 empty project", () => {
  test("without a .thunderjar/ folder, or --data-dir, there's no store to read", async () => {
    // Outside the repo, whose own .thunderjar/ would otherwise be found above it.
    await using copy = await copyScenarioProject("0101", { outsideRepo: true });
    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["executions"]);

    expect(stdout).toBe("");
    expect(stderr).toBe("Error: No .thunderjar/ folder in <PROJECT> or any folder above it. Run `thunderjar init` first.\n");
    expect(exitCode).toBe(1);
  });
});

describe("--json", () => {
  test("prints the executions as a JSON array of their records, newest first, and nothing else", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0203"), ["executions", "--json"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const executions = JSON.parse(stdout);
    expect(executions.map(({ testCase }: { testCase: string }) => testCase)).toEqual(["two-harnesses", "example", "two-harnesses", "is-prime-baseline"]);
    expect(executions[3]).toEqual({
      executionId: "<ULID>",
      testCase: "is-prime-baseline",
      task: "is-prime",
      startedAt: "2026-10-01T10:12:04.517Z",
      finishedAt: "2026-10-01T10:42:01.717Z",
      status: "complete",
      matrix: { shape: [1, 1, 2, 2, 2], permutations: 8, iterations: 5 },
    });
  });

  test("of one test case, only its executions", async () => {
    const { stdout } = await thunderjar(scenario("0203"), ["executions", "example", "--json"]);

    expect(JSON.parse(stdout).map(({ testCase }: { testCase: string }) => testCase)).toEqual(["example"]);
  });

  test("with none recorded, an empty array", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0203"), ["executions", "--json", "--data-dir", dataDir()]);

    expect({ stdout, stderr, exitCode }).toEqual({ stdout: "[]\n", stderr: "", exitCode: 0 });
  });
});
