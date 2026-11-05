// `thunderjar executions`, through the CLI. It only reads the store, so it runs on the scenarios
// unchanged: 0203 has a run data store checked in, of three executions. Stores that are empty or
// corrupt are made in a temporary `--data-dir`, never in a scenario. Any of these can be run by
// hand, e.g. `bun run fixture 0203 executions two-harnesses`.
import { afterEach, describe, expect, test } from "bun:test";
import { $ } from "bun";
import { TMP_DIR, thunderjar } from "../../../testing/cli.ts";
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
      stdout: `<ULID>  example            2026-10-03 09:05  1 permutation × 1 iteration    running
<ULID>  two-harnesses      2026-10-02 14:40  2 permutations × 1 iteration   failed
<ULID>  is-prime-baseline  2026-10-01 10:12  8 permutations × 5 iterations  complete
`,
      stderr: "",
      exitCode: 0,
    });
  });

  test("lists the store's execution IDs", async () => {
    const { stdout } = await $`bun ${import.meta.dir}/../../index.ts executions`.cwd(scenario("0203")).quiet();

    expect(stdout.toString().match(/^\w{26}/gm)).toEqual([
      "01m40g5972dza3k7g3d36k55zw",
      "01m3ygz4g89aqh8yey8em0twpq",
      "01m3vf68s54p5eyn5s3t1ygkdj",
    ]);
  });

  test("<test case>: only that test case's executions", async () => {
    expect(await thunderjar(scenario("0203"), ["executions", "two-harnesses"])).toEqual({
      stdout: "<ULID>  two-harnesses  2026-10-02 14:40  2 permutations × 1 iteration  failed\n",
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
      stdout: "<ULID>  two-harnesses  2026-10-02 14:40  2 permutations × 1 iteration  failed\n",
      stderr: "",
      exitCode: 0,
    });
  });

  test("a record that isn't JSON is an error naming its file", async () => {
    const data = dataDir();
    await $`mkdir -p ${data}/runs && cp -R ${scenario("0203")}/.thunderjar/.data/runs/. ${data}/runs`.quiet();
    await Bun.write(`${data}/runs/01m3ygz4g89aqh8yey8em0twpq/execution.json`, '{ "executionId": ');

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0203"), ["executions", "--data-dir", data], {
      paths: { "<DATA>": data },
    });

    expect(stdout).toBe("");
    expect(stderr).toMatch(/^Error: Can't read <DATA>\/runs\/<ULID>\/execution\.json: .+\n$/);
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
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0101"), ["executions"]);

    expect(stdout).toBe("");
    expect(stderr).toBe("Error: No .thunderjar/ folder in <PROJECT> or any folder above it. Run `thunderjar init` first.\n");
    expect(exitCode).toBe(1);
  });
});
