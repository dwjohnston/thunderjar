// `thunderjar show`, through the CLI. It only reads the store, so it runs on the scenarios
// unchanged: 0203 has a run data store checked in, of four executions. Stores changed for a test
// are copied to a temporary `--data-dir`, never changed in the scenario. Any of these can be run
// by hand, e.g. `bun run fixture 0203 show 01m3vf68s54p5eyn5s3t1ygkdj`.
import { afterEach, describe, expect, test } from "bun:test";
import { $ } from "bun";
import { Database } from "bun:sqlite";
import { copyScenarioProject, TMP_DIR, thunderjar } from "../../../testing/cli.ts";
import { scenario } from "../../../testing/scenario.ts";

/** Is-prime-baseline: complete, 8 permutations × 5 iterations; 2-4 errored and 6-3 skipped measures. */
const BASELINE = "01m3vf68s54p5eyn5s3t1ygkdj";
/** Two-harnesses: failed, 2 permutations × 1 iteration; fake-harness-beta's run exited 3. */
const TWO_HARNESSES = "01m3ygz4g89aqh8yey8em0twpq";
/** Example: running, with no container runs yet. */
const RUNNING = "01m40g5972dza3k7g3d36k55zw";
/** Two-harnesses: failed, fake-harness-alpha's run timed out after 600s. */
const TIMED_OUT = "01m430hgt00w0g80g80m3g2102";

const dirs: string[] = [];

/** A copy of 0203's store, as a `--data-dir` removed after the test. */
async function copyOfStore(): Promise<string> {
  const dir = `${TMP_DIR}/data-${crypto.randomUUID()}`;
  dirs.push(dir);
  await $`mkdir -p ${dir} && cp -R ${scenario("0203")}/.thunderjar/.data/. ${dir}`.quiet();
  return dir;
}

/** Runs `sql` on the store in `dataDir`, a copy of a scenario's. */
function changeStore(dataDir: string, sql: string, params: Record<string, string> = {}) {
  const db = new Database(`${dataDir}/runs.sqlite`, { strict: true });
  db.query(sql).run(params);
  db.close();
}

afterEach(async () => {
  for (const dir of dirs.splice(0)) await $`rm -rf ${dir}`.quiet();
});

describe("0203 recorded executions", () => {
  test("<execution>: a row per permutation by its varying parameters, a column per metric, and why each iteration left out was", async () => {
    expect(await thunderjar(scenario("0203"), ["show", BASELINE])).toEqual({
      stdout: `Execution  <ULID>
Test case  is-prime-baseline
Task       is-prime
Started    2026-10-01 10:12
Status     complete
Matrix     8 permutations × 5 iterations

     promptSet | harnessModel | initialPrompt                    runs   isPrimeShape.lines ↓   isPrimeShape.comments   isPrimeShape.singleExport ↑   isPrimeTests.passRate ↑   isPrimeTests.passed ↑   isPrimeTsExists.exists   tsIgnoreCount.count
 1   snerk | fake-harness-alpha@1.0.0/fake-model-small | plain   5/5    3.0*                   2.0*                    4/4*                          0.6                       3.2                     5/5                      1.0
 2   snerk | fake-harness-alpha@1.0.0/fake-model-small | terse   5/5    3.0                    2.0                     5/5                           0.6*                      3.0*                    5/5                      1.2
 3   snerk | fake-harness-beta@1.0.0/fake-model-large | plain    5/5    2.0                    1.0                     5/5                           1.0                       5.0                     5/5                      0.0
 4   snerk | fake-harness-beta@1.0.0/fake-model-large | terse    5/5    2.0                    1.0                     5/5                           1.0                       4.8                     5/5                      0.0
 5   glurk | fake-harness-alpha@1.0.0/fake-model-small | plain   5/5    3.0                    2.0                     5/5                           0.6                       3.0                     5/5                      0.8
 6   glurk | fake-harness-alpha@1.0.0/fake-model-small | terse   5/5    3.0*                   2.0*                    4/4*                          0.6*                      3.0*                    4/5                      1.0*
 7   glurk | fake-harness-beta@1.0.0/fake-model-large | plain    5/5    2.0                    1.0                     5/5                           1.0                       5.0                     5/5                      0.2
 8   glurk | fake-harness-beta@1.0.0/fake-model-large | terse    5/5    2.0                    1.0                     5/5                           1.0                       5.0                     5/5                      0.0

* Left out:
  1-3  isPrimeShape.lines         score failed  (score threw: JSON Parse error: Unexpected identifier "warning")
  1-3  isPrimeShape.comments      score failed  (score threw: JSON Parse error: Unexpected identifier "warning")
  1-3  isPrimeShape.singleExport  score failed  (score threw: JSON Parse error: Unexpected identifier "warning")
  2-4  isPrimeTests               errored while measuring  (isPrime.test.ts didn't run against isPrime.ts: error: Unexpected end of file)
  6-3  isPrimeShape.lines         not applicable
  6-3  isPrimeShape.comments      not applicable
  6-3  isPrimeShape.singleExport  not applicable
  6-3  isPrimeTests               skipped  (no file matches **/isPrime.ts)
  6-3  tsIgnoreCount              skipped  (no file matches **/*.ts)
`,
      stderr: "",
      exitCode: 0,
    });
  });

  test("<execution> --json: the summary the table is drawn from, a permutation each, its metrics aggregated", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0203"), ["show", BASELINE, "--json"]);
    expect({ stderr, exitCode }).toEqual({ stderr: "", exitCode: 0 });
    const summary = JSON.parse(stdout);

    expect(summary.measurements).toEqual([
      {
        name: "isPrimeShape",
        metrics: [
          { name: "lines", stat: "median", kind: "number", better: "lower" },
          { name: "comments", stat: "mean", kind: "number" },
          { name: "singleExport", stat: "rate", kind: "boolean", better: "higher" },
        ],
      },
      {
        name: "isPrimeTests",
        metrics: [
          { name: "passRate", stat: "mean", kind: "number", better: "higher" },
          { name: "passed", stat: "mean", kind: "number", better: "higher" },
        ],
      },
      { name: "isPrimeTsExists", metrics: [{ name: "exists", stat: "rate", kind: "boolean" }] },
      { name: "tsIgnoreCount", metrics: [{ name: "count", stat: "mean", kind: "number" }] },
    ]);
    expect(summary.varyingAxes).toEqual(["promptSet", "harnessModel", "initialPrompt"]);
    expect(summary.commonParameters).toEqual([
      { axis: "baseImage", name: "node20" },
      { axis: "codeState", name: "baseline" },
    ]);
    expect(summary.permutations).toHaveLength(8);
    const [, second] = summary.permutations;
    expect(second.parameters).toMatchObject({ promptSet: "snerk", initialPrompt: "terse" });
    expect(second.iterations).toBe(5);
    expect(second.agent).toEqual([{ end: "done", runs: 5 }]);
    expect(second.measures.isPrimeTests).toEqual({
      measured: 4,
      metrics: {
        passRate: { kind: "number", stat: "mean", better: "higher", value: 0.6, applicable: 4, notApplicable: 0, failed: [] },
        passed: { kind: "number", stat: "mean", better: "higher", value: 3, applicable: 4, notApplicable: 0, failed: [] },
      },
    });
    expect(second.measures.isPrimeTsExists).toEqual({
      measured: 5,
      metrics: { exists: { kind: "boolean", stat: "rate", value: 1, applicable: 5, notApplicable: 0, failed: [] } },
    });
    expect(second.leftOut).toEqual([
      {
        run: "2-4",
        measurement: "isPrimeTests",
        why: "erroredWhileMeasuring",
        reason: "isPrime.test.ts didn't run against isPrime.ts: error: Unexpected end of file",
      },
    ]);
    // 1-3's isPrimeShape printed a warning before its JSON: each of its metrics' scores failed, with why.
    const [first] = summary.permutations;
    expect(first.measures.isPrimeShape.metrics.lines).toEqual({
      kind: "number",
      stat: "median",
      better: "lower",
      value: 3,
      applicable: 4,
      notApplicable: 0,
      failed: [{ iteration: 3, reason: 'score threw: JSON Parse error: Unexpected identifier "warning"' }],
    });
    expect(second.durationMs).toMatchObject({ of: 5 });
  });

  test("<execution> <container run> --json: its record", async () => {
    const { stdout, exitCode } = await thunderjar(scenario("0203"), ["show", BASELINE, "6-3", "--json"]);
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ permutation: 6, iteration: 3, parameters: { promptSet: { name: "glurk" } } });
  });

  test("<execution> that failed: a metric no iteration has a score for shows –, and a rate counts only the iterations it applies to", async () => {
    expect(await thunderjar(scenario("0203"), ["show", TWO_HARNESSES])).toEqual({
      stdout: `Execution  <ULID>
Test case  two-harnesses
Task       is-prime
Started    2026-10-02 14:40
Status     failed
Matrix     2 permutations × 1 iteration

     harnessModel                                runs   isPrimeShape.lines ↓   isPrimeShape.comments   isPrimeShape.singleExport ↑   isPrimeTests.passRate ↑   isPrimeTests.passed ↑   isPrimeTsExists.exists   tsIgnoreCount.count
 1   fake-harness-alpha@1.0.0/fake-model-small   1/1    3.0                    2.0                     1/1                           0.6                       3.0                     1/1                      1.0
 2   fake-harness-beta@1.0.0/fake-model-large    1/1    –*                     –*                      –*                            –*                        –*                      0/1                      –*

! Agents that didn't end cleanly:
  2-1  exited 3, no result file

* Left out:
  2-1  isPrimeShape.lines         not applicable
  2-1  isPrimeShape.comments      not applicable
  2-1  isPrimeShape.singleExport  not applicable
  2-1  isPrimeTests               skipped  (no file matches **/isPrime.ts)
  2-1  tsIgnoreCount              skipped  (no file matches **/*.ts)
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

  test("<execution> <container run>: its parameters, how the agent ran, each measure as stored, and each metric's score, or why it has none", async () => {
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

Harness      fake-harness-alpha 1.0.0
Model        fake-model-small  (fake-model-small-001)
Duration     0:32
Exit         0
Result file  33 bytes

Measures
  isPrimeShape     {exitCode: 1, stdout: "", stdoutTruncated: false}
  isPrimeTests     skipped  (no file matches **/isPrime.ts)
  isPrimeTsExists  false
  tsIgnoreCount    skipped  (no file matches **/*.ts)

Metrics
  isPrimeShape.lines ↓         not applicable
  isPrimeShape.comments        not applicable
  isPrimeShape.singleExport ↑  not applicable
  isPrimeTests.passRate ↑      no measure
  isPrimeTests.passed ↑        no measure
  isPrimeTsExists.exists       false
  tsIgnoreCount.count          no measure
`,
      stderr: "",
      exitCode: 0,
    });
  });

  test("<container run> errored while measuring, and exited non-zero", async () => {
    const { stdout: errored } = await thunderjar(scenario("0203"), ["show", BASELINE, "2-4"]);
    const { stdout: failed } = await thunderjar(scenario("0203"), ["show", TWO_HARNESSES, "2-1"]);

    expect(errored).toContain(
      "  isPrimeTests     errored while measuring  (isPrime.test.ts didn't run against isPrime.ts: error: Unexpected end of file)\n",
    );
    expect(failed).toContain("Exit         3\nResult file  none\n");
  });

  test("<execution> with a run that timed out lists it below the table, measured all the same; with token costs, their means", async () => {
    const { stdout, exitCode } = await thunderjar(scenario("0203"), ["show", TIMED_OUT]);

    expect(exitCode).toBe(0);
    expect(stdout).toEndWith(`
     harnessModel                                runs   isPrimeShape.lines ↓   isPrimeShape.comments   isPrimeShape.singleExport ↑   isPrimeTests.passRate ↑   isPrimeTests.passed ↑   isPrimeTsExists.exists   tsIgnoreCount.count   tokens (mean)   cost (mean)
 1   fake-harness-alpha@1.0.0/fake-model-small   1/1    3.0                    2.0                     1/1                           0.6                       3.0                     1/1                      1.0                   not reported    —
 2   fake-harness-beta@1.0.0/fake-model-large    1/1    2.0                    1.0                     1/1                           1.0                       5.0                     1/1                      0.0                   9,300           $0.045

! Agents that didn't end cleanly:
  1-1  timed out after <duration>

* Left out:
  1-1  tokens  not reported  (absent)
`);
  });

  test("<execution> recorded before token costs were has no columns for them", async () => {
    const { stdout } = await thunderjar(scenario("0203"), ["show", BASELINE]);

    expect(stdout).not.toContain("tokens");
  });

  test("<container run> that timed out says so, with how long it ran before it was killed", async () => {
    const { stdout, exitCode } = await thunderjar(scenario("0203"), ["show", TIMED_OUT, "1-1"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Duration     10:00\nExit         timed out after <duration>\nResult file  none\n\nReply\n  none  (the agent left no result file)\n\nToken costs\n  none  (absent)\n\nMeasures\n");
  });

  test("<container run> recorded with a reply shows it, under the agent's run", async () => {
    const { stdout, exitCode } = await thunderjar(scenario("0203"), ["show", TIMED_OUT, "2-1"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain(`
Exit         0
Result file  88 bytes

Reply
  I wrote isPrime.ts, and tested it up to 100.

Token costs
  model                 input  output  cache write  cache read  cost
  fake-model-large-001  9,000  300     0            0           $0.045

Measures
`);
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
    changeStore(data, "DELETE FROM container_runs WHERE execution_id = $id AND permutation = 1 AND iteration = 1", { id: TWO_HARNESSES });

    const { stdout, exitCode } = await thunderjar(scenario("0203"), ["show", TWO_HARNESSES, "--data-dir", data]);

    expect(stdout).toEndWith(`
     baseImage | codeState | promptSet | harnessModel | initialPrompt               runs   isPrimeShape.lines ↓   isPrimeShape.comments   isPrimeShape.singleExport ↑   isPrimeTests.passRate ↑   isPrimeTests.passed ↑   isPrimeTsExists.exists   tsIgnoreCount.count
 1   no container runs
 2   node20 | baseline | snerk | fake-harness-beta@1.0.0/fake-model-large | plain   1/1    –*                     –*                      –*                            –*                        –*                      0/1                      –*

! Agents that didn't end cleanly:
  2-1  exited 3, no result file

* Left out:
  2-1  isPrimeShape.lines         not applicable
  2-1  isPrimeShape.comments      not applicable
  2-1  isPrimeShape.singleExport  not applicable
  2-1  isPrimeTests               skipped  (no file matches **/isPrime.ts)
  2-1  tsIgnoreCount              skipped  (no file matches **/*.ts)
`);
    expect(exitCode).toBe(0);
  });

  test("a run that exited non-zero shows why: the last line of its stderr below the table, and its stderr's tail on its own", async () => {
    const data = await copyOfStore();
    const stderr = [...Array.from({ length: 24 }, (_, i) => `retrying ${i + 1}`), "Error: unknown model fake-model-large", ""].join("\n");
    changeStore(data, "UPDATE container_runs SET record = json_set(record, '$.harnessStderr', $stderr) WHERE execution_id = $id AND permutation = 2", {
      id: TWO_HARNESSES,
      stderr,
    });

    const table = await thunderjar(scenario("0203"), ["show", TWO_HARNESSES, "--data-dir", data]);
    const run = await thunderjar(scenario("0203"), ["show", TWO_HARNESSES, "2-1", "--data-dir", data]);

    expect(table.stdout).toContain("! Agents that didn't end cleanly:\n  2-1  exited 3, no result file  Error: unknown model fake-model-large\n");
    expect(run.stdout).toContain(`
Exit         3
Result file  none
Stderr       ${new TextEncoder().encode(stderr).length} bytes

Stderr
  … 5 lines before
${Array.from({ length: 19 }, (_, i) => `  retrying ${i + 6}`).join("\n")}
  Error: unknown model fake-model-large

`);
  });

  test("--data-dir reads a container run outside any project", async () => {
    const store = `${scenario("0203")}/.thunderjar/.data`;

    const { stdout, exitCode } = await thunderjar(TMP_DIR, ["show", BASELINE, "1-1", "--data-dir", store]);

    expect(stdout).toStartWith("Container run  1-1\n");
    expect(exitCode).toBe(0);
  });

  test("a measure taken before its measurement changed is stale: left out, saying why, and the rest still shows", async () => {
    await using copy = await copyScenarioProject("0203");
    const file = `${copy.dir}/.thunderjar/parameters/tasks/is-prime/measurements/tsIgnoreCount.ts`;
    await Bun.write(file, (await Bun.file(file).text()).replace('"@ts-ignore"', '"@ts-expect-error"'));

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["show", BASELINE]);

    expect(stdout).toContain(`
     promptSet | harnessModel | initialPrompt                    runs   isPrimeShape.lines ↓   isPrimeShape.comments   isPrimeShape.singleExport ↑   isPrimeTests.passRate ↑   isPrimeTests.passed ↑   isPrimeTsExists.exists   tsIgnoreCount.count
 1   snerk | fake-harness-alpha@1.0.0/fake-model-small | plain   5/5    3.0*                   2.0*                    4/4*                          0.6                       3.2                     5/5                      –*
`);
    expect(stdout).toContain("\n  1-1  tsIgnoreCount              stale  (measured before the measurement or its instrument changed)\n");
    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
  });

  test("a metric added since the runs were measured is read from their stored measures, with no remeasuring", async () => {
    await using copy = await copyScenarioProject("0203");
    const file = `${copy.dir}/.thunderjar/parameters/tasks/is-prime/measurements/isPrimeTests.ts`;
    await Bun.write(file, (await Bun.file(file).text()).replace("  },\n});", '    allPassed: { score: (v) => v.passed === v.total, stat: "count" },\n  },\n});'));

    const { stdout, exitCode } = await thunderjar(copy.dir, ["show", TIMED_OUT, "--json"]);

    expect(exitCode).toBe(0);
    const { permutations } = JSON.parse(stdout) as { permutations: { measures: Record<string, { metrics: Record<string, { value?: number }> }> }[] };
    expect(permutations.map(({ measures }) => measures.isPrimeTests?.metrics.allPassed?.value)).toEqual([0, 1]);
  });

  test("a record that isn't JSON is an error naming the store and the record", async () => {
    const data = await copyOfStore();
    changeStore(data, "UPDATE container_runs SET record = '{ \"executionId\": ' WHERE execution_id = $id AND permutation = 1 AND iteration = 1", { id: TWO_HARNESSES });

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0203"), ["show", TWO_HARNESSES, "--data-dir", data], {
      paths: { "<DATA>": data },
    });

    expect(stdout).toBe("");
    expect(stderr).toMatch(/^Error: Can't read <DATA>\/runs\.sqlite: container run <ULID> 1-1: .+\n$/);
    expect(exitCode).toBe(1);
  });
});

describe("0101 empty project", () => {
  test("without a .thunderjar/ folder there's no store, or measurements, to read", async () => {
    // Outside the repo, whose own .thunderjar/ would otherwise be found above it.
    await using copy = await copyScenarioProject("0101", { outsideRepo: true });
    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["show", BASELINE]);

    expect(stdout).toBe("");
    expect(stderr).toBe("Error: No .thunderjar/ folder in <PROJECT> or any folder above it. Run `thunderjar init` first.\n");
    expect(exitCode).toBe(1);
  });
});
