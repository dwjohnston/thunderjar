// `thunderjar show`, through the CLI. It only reads the store, so it runs on the scenarios
// unchanged: 0203 has a run data store checked in, of three executions. Stores changed for a test
// are copied to a temporary `--data-dir`, never changed in the scenario. Any of these can be run
// by hand, e.g. `bun run fixture 0203 show 01m3vf68s54p5eyn5s3t1ygkdj`.
import { afterEach, describe, expect, test } from "bun:test";
import { $ } from "bun";
import { TMP_DIR, thunderjar } from "../../../testing/cli.ts";
import { scenario } from "../../../testing/scenario.ts";

/** Is-prime-baseline: complete, 8 permutations × 5 iterations; 2-4 errored and 6-3 skipped measures. */
const BASELINE = "01m3vf68s54p5eyn5s3t1ygkdj";
/** Two-harnesses: failed, 2 permutations × 1 iteration; fake-harness-beta's run exited 3. */
const TWO_HARNESSES = "01m3ygz4g89aqh8yey8em0twpq";
/** Example: running, with no container runs yet. */
const RUNNING = "01m40g5972dza3k7g3d36k55zw";

const dirs: string[] = [];

/** A copy of 0203's store, as a `--data-dir` removed after the test. */
async function copyOfStore(): Promise<string> {
  const dir = `${TMP_DIR}/data-${crypto.randomUUID()}`;
  dirs.push(dir);
  await $`mkdir -p ${dir} && cp -R ${scenario("0203")}/.thunderjar/.data/. ${dir}`.quiet();
  return dir;
}

afterEach(async () => {
  for (const dir of dirs.splice(0)) await $`rm -rf ${dir}`.quiet();
});

describe("0203 recorded executions", () => {
  test("<execution>: a row per permutation by its varying parameters, each measure aggregated by its methods, and what's left out", async () => {
    expect(await thunderjar(scenario("0203"), ["show", BASELINE])).toEqual({
      stdout: `Execution  <ULID>
Test case  is-prime-baseline
Task       is-prime
Started    2026-10-01 10:12
Status     complete
Matrix     8 permutations × 5 iterations

                                                                        isPrimeTemplateTest                                      isPrimeTsExists   tsIgnoreCount
     promptSet | harnessModel | initialPrompt                    runs   sum                        mean                          rate              mean   max
 1   snerk | fake-harness-alpha@1.0.0/fake-model-small | plain   5/5    {passed: 16, failed: 9}    {passed: 3.2, failed: 1.8}    5/5               1.0    1
 2   snerk | fake-harness-alpha@1.0.0/fake-model-small | terse   5/5    {passed: 12, failed: 8}*   {passed: 3.0, failed: 2.0}*   5/5               1.2    2
 3   snerk | fake-harness-beta@1.0.0/fake-model-large | plain    5/5    {passed: 25, failed: 0}    {passed: 5.0, failed: 0.0}    5/5               0.0    0
 4   snerk | fake-harness-beta@1.0.0/fake-model-large | terse    5/5    {passed: 24, failed: 1}    {passed: 4.8, failed: 0.2}    5/5               0.0    0
 5   glurk | fake-harness-alpha@1.0.0/fake-model-small | plain   5/5    {passed: 15, failed: 10}   {passed: 3.0, failed: 2.0}    5/5               0.8    1
 6   glurk | fake-harness-alpha@1.0.0/fake-model-small | terse   5/5    {passed: 12, failed: 8}*   {passed: 3.0, failed: 2.0}*   4/5               1.0*   1*
 7   glurk | fake-harness-beta@1.0.0/fake-model-large | plain    5/5    {passed: 25, failed: 0}    {passed: 5.0, failed: 0.0}    5/5               0.2    1
 8   glurk | fake-harness-beta@1.0.0/fake-model-large | terse    5/5    {passed: 25, failed: 0}    {passed: 5.0, failed: 0.0}    5/5               0.0    0

* Left out of the aggregate:
  2-4  isPrimeTemplateTest  errored while measuring  (isPrime.ts has 2 exports (isPrime, isComposite); {{defaultExport}} binds to a single one)
  6-3  isPrimeTemplateTest  skipped  (no file matches **/isPrime.ts)
  6-3  tsIgnoreCount        skipped  (no file matches **/*.ts)
`,
      stderr: "",
      exitCode: 0,
    });
  });

  test("<execution> that failed: a measure no iteration measured shows —, and a rate counts only the iterations measured", async () => {
    expect(await thunderjar(scenario("0203"), ["show", TWO_HARNESSES])).toEqual({
      stdout: `Execution  <ULID>
Test case  two-harnesses
Task       is-prime
Started    2026-10-02 14:40
Status     failed
Matrix     2 permutations × 1 iteration

                                                        isPrimeTemplateTest                                   isPrimeTsExists   tsIgnoreCount
     harnessModel                                runs   sum                      mean                         rate              mean   max
 1   fake-harness-alpha@1.0.0/fake-model-small   1/1    {passed: 3, failed: 2}   {passed: 3.0, failed: 2.0}   1/1               1.0    1
 2   fake-harness-beta@1.0.0/fake-model-large    1/1    —                        —                            0/1               —      —

* Left out of the aggregate:
  2-1  isPrimeTemplateTest  skipped  (no file matches **/isPrime.ts)
  2-1  tsIgnoreCount        skipped  (no file matches **/*.ts)
`,
      stderr: "",
      exitCode: 0,
    });
  });

  test("<execution> with no container runs says so, instead of an empty table", async () => {
    expect(await thunderjar(scenario("0203"), ["show", RUNNING])).toEqual({
      stdout: `Execution  <ULID>
Test case  example
Task       is-prime
Started    2026-10-03 09:05
Status     running
Matrix     1 permutation × 1 iteration

No container runs recorded.
`,
      stderr: "",
      exitCode: 0,
    });
  });

  test("<execution> <container run>: its parameters, how the agent ran, and each measure, with why it has no value", async () => {
    expect(await thunderjar(scenario("0203"), ["show", BASELINE, "6-3"])).toEqual({
      stdout: `Container run  6-3
Execution      <ULID>  (is-prime-baseline)
Permutation    6  (050f83dc), iteration 3
Postrun image  thunderjar-postrun:<ULID>-6-3
Ran at         2026-10-01 10:32

Parameters
  baseImage      node20                                     f71eef28
  codeState      baseline                                   e7d31463
  promptSet      glurk                                      cd14120b
  harnessModel   fake-harness-alpha@1.0.0/fake-model-small  7cf14b84
  initialPrompt  terse                                      4bd07001

Harness    fake-harness-alpha 1.0.0
Model      fake-model-small  (fake-model-small-001)
Duration   0:32
Exit code  0

Measures
  isPrimeTemplateTest  skipped  (no file matches **/isPrime.ts)
  isPrimeTsExists      false
  tsIgnoreCount        skipped  (no file matches **/*.ts)
`,
      stderr: "",
      exitCode: 0,
    });
  });

  test("<container run> errored while measuring, and exited non-zero", async () => {
    const { stdout: errored } = await thunderjar(scenario("0203"), ["show", BASELINE, "2-4"]);
    const { stdout: failed } = await thunderjar(scenario("0203"), ["show", TWO_HARNESSES, "2-1"]);

    expect(errored).toContain(
      "  isPrimeTemplateTest  errored while measuring  (isPrime.ts has 2 exports (isPrime, isComposite); {{defaultExport}} binds to a single one)\n",
    );
    expect(failed).toContain("Exit code  3\n");
  });

  test("<container run> can be its postrun image", async () => {
    expect((await thunderjar(scenario("0203"), ["show", BASELINE, `thunderjar-postrun:${BASELINE}-1-1`])).stdout).toStartWith(
      "Container run  1-1\n",
    );
  });

  test("an unknown execution is an error", async () => {
    expect(await thunderjar(scenario("0203"), ["show", "nope"])).toEqual({
      stdout: "",
      stderr: "Error: No execution nope recorded. List them with `thunderjar executions`.\n",
      exitCode: 1,
    });
  });

  test("an unknown container run is an error", async () => {
    expect(await thunderjar(scenario("0203"), ["show", BASELINE, "9-9"])).toEqual({
      stdout: "",
      stderr: "Error: Execution <ULID> has no container run 9-9.\n",
      exitCode: 1,
    });
  });

  test("--data-dir reads the store there; a permutation without container runs says so, and with none varying, every parameter shows", async () => {
    const data = await copyOfStore();
    await $`rm ${data}/runs/${TWO_HARNESSES}/container-runs/1-1.json`.quiet();

    const { stdout, exitCode } = await thunderjar(scenario("0203"), ["show", TWO_HARNESSES, "--data-dir", data]);

    expect(stdout).toEndWith(`
                                                                                           isPrimeTemplateTest   isPrimeTsExists   tsIgnoreCount
     baseImage | codeState | promptSet | harnessModel | initialPrompt               runs   sum   mean            rate              mean   max
 1   no container runs
 2   node20 | baseline | snerk | fake-harness-beta@1.0.0/fake-model-large | plain   1/1    —     —               0/1               —      —

* Left out of the aggregate:
  2-1  isPrimeTemplateTest  skipped  (no file matches **/isPrime.ts)
  2-1  tsIgnoreCount        skipped  (no file matches **/*.ts)
`);
    expect(exitCode).toBe(0);
  });

  test("--data-dir reads a container run outside any project", async () => {
    const store = `${scenario("0203")}/.thunderjar/.data`;

    const { stdout, exitCode } = await thunderjar(TMP_DIR, ["show", BASELINE, "1-1", "--data-dir", store]);

    expect(stdout).toStartWith("Container run  1-1\n");
    expect(exitCode).toBe(0);
  });

  test("a record that isn't JSON is an error naming its file", async () => {
    const data = await copyOfStore();
    await Bun.write(`${data}/runs/${TWO_HARNESSES}/container-runs/1-1.json`, '{ "executionId": ');

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0203"), ["show", TWO_HARNESSES, "--data-dir", data], {
      paths: { "<DATA>": data },
    });

    expect(stdout).toBe("");
    expect(stderr).toMatch(/^Error: Can't read <DATA>\/runs\/<ULID>\/container-runs\/1-1\.json: .+\n$/);
    expect(exitCode).toBe(1);
  });
});

describe("0101 empty project", () => {
  test("without a .thunderjar/ folder there's no store, or measurements, to read", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0101"), ["show", BASELINE]);

    expect(stdout).toBe("");
    expect(stderr).toBe("Error: No .thunderjar/ folder in <PROJECT> or any folder above it. Run `thunderjar init` first.\n");
    expect(exitCode).toBe(1);
  });
});
