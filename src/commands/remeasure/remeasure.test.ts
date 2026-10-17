// `thunderjar remeasure`, through the CLI, in place in fixtureTests/scenario_8_recorded_executions,
// which starts with a run data store of four executions. For now an execution prints its plan:
// each current measurement's status, and each deleted name with its stored measures. A test case
// lists every execution of it, and which have nothing to do. It measures nothing, but recomputes
// and stores every aggregation result of each execution it's given from the Results already
// stored, so a successful remeasure writes to a disposable copy of the store, given with
// `--data-dir`; the checked-in store is left as it was and Docker is never used. Each asserts on
// stdout, stderr and the exit code. Any of these can be run by hand, with an absolute
// `--data-dir` holding a copy of the scenario's `.thunderjar/.data/runs.json`:
//
//   bun run fixture 8 remeasure 01k4x9j2e8mqz3abcdefghjkmn --data-dir <dir>
//   bun run fixture 8 remeasure fails --data-dir <dir>

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fakeDocker, scenario, thunderjar } from "../../testing/cli.ts";
import type { AggregationResult, ContainerRunRecord } from "../../store/run-data-store.ts";

const USAGE = "usage: thunderjar remeasure <test case | execution> [--data-dir <dir>]\n";

/** Recorded before aggregation results were stored; one run exited 3 and was never measured. */
const OLDEST = "01k4tq3h8r0000000000000000";
/** readmeExists, since deleted, errored in each permutation's first iteration; one isPrimeTemplateTest is stale. */
const ERRORED = "01k4x9j2e8mqz3abcdefghjkmn";
/** The latest execution of `fails`, after readmeExists was deleted. */
const LATEST = "01k4xc0000000000000000000a";
/** The only execution of `times-out`, whose task has no measurements; each run exited 124. */
const TIMED_OUT = "01k4xb7q0c2tnvabcdefghjkmn";

/** The failing agent's permutation of `fails`, and the behaving agent's. */
const FAILING = "42440c48b1cee8eeabea4c8ac45fb03f66331039bb3b57b9ecca96bc83a4fb03";
const BEHAVING = "8ffdda6e5c8221796af0671d22f10f9e35edab65e0c056a829946f54c90753e7";
const WAITING = "389190d41af852c3b80e2d399804c682de3810d2b936de26db7de0ac273faca6";

const NOT_APPLIED = "Not implemented: applying measurements.";

/** Every container run takes 0.04s in this scenario. */
const DURATION = { mean: 40, max: 40 };

/** ERRORED's aggregation results recomputed: as stored, without the deleted readmeExists. */
const ERRORED_RECOMPUTED: AggregationResult[] = [
  {
    executionId: ERRORED,
    permutationHash: FAILING,
    iterations: 2,
    measures: {
      isPrimeTemplateTest: { measured: 0 },
      isPrimeTsExists: { measured: 2, rate: 0 },
      tsIgnoreCount: { measured: 0 },
    },
    duration: DURATION,
  },
  {
    executionId: ERRORED,
    permutationHash: BEHAVING,
    iterations: 2,
    measures: {
      isPrimeTemplateTest: { measured: 2, mean: { passed: 3, failed: 2 }, sum: { passed: 6, failed: 4 } },
      isPrimeTsExists: { measured: 2, rate: 1 },
      tsIgnoreCount: { measured: 2, median: 1, min: 1, sum: 2 },
    },
    duration: DURATION,
  },
];

/** OLDEST's aggregation results, which it had none of: the behaving agent's unmeasured run gives no values. */
const OLDEST_COMPUTED: AggregationResult[] = [
  {
    executionId: OLDEST,
    permutationHash: FAILING,
    iterations: 2,
    measures: {
      isPrimeTemplateTest: { measured: 0 },
      isPrimeTsExists: { measured: 2, rate: 0 },
      tsIgnoreCount: { measured: 0 },
    },
    duration: DURATION,
  },
  {
    executionId: OLDEST,
    permutationHash: BEHAVING,
    iterations: 2,
    measures: {
      isPrimeTemplateTest: { measured: 1, mean: { passed: 3, failed: 2 }, sum: { passed: 3, failed: 2 } },
      isPrimeTsExists: { measured: 1, rate: 1 },
      tsIgnoreCount: { measured: 1, median: 1, min: 1, sum: 1 },
    },
    duration: DURATION,
  },
];

interface StoreFile {
  containerRuns: ContainerRunRecord[];
  aggregationResults?: AggregationResult[];
}

const read = (path: string) => JSON.parse(readFileSync(path, "utf8")) as StoreFile;

/** `executionId`'s stored aggregation results, by permutation hash. */
const aggregatesOf = (file: StoreFile, executionId: string) =>
  (file.aggregationResults ?? [])
    .filter((r) => r.executionId === executionId)
    .toSorted((a, b) => (a.permutationHash < b.permutationHash ? -1 : 1));

describe("scenario_8_recorded_executions", () => {
  const fixtures = scenario("scenario_8_recorded_executions");
  const dataDir = join(fixtures, ".thunderjar", ".data");
  const store = join(dataDir, "runs.json");
  const checkedIn = readFileSync(store);
  const starting = read(store);

  const disposable: string[] = [];
  /** A disposable data directory, holding an exact copy of the checked-in store. */
  const seededDataDir = async () => {
    const dir = await mkdtemp(join(tmpdir(), "thunderjar-remeasure-"));
    disposable.push(dir);
    await copyFile(store, join(dir, "runs.json"));
    return { dir, store: join(dir, "runs.json") };
  };

  afterEach(async () => {
    expect(readFileSync(store).equals(checkedIn)).toBe(true);
    for (const dir of disposable.splice(0)) await rm(dir, { recursive: true, force: true });
  });

  test("remeasure <execution> reports each measurement's status and the deleted readmeExists, and recomputes both its aggregates without readmeExists", async () => {
    const docker = await fakeDocker();
    const expected = {
      stdout: `Execution ${ERRORED}  (4 container runs)
Current measurements for task is-prime:
  isPrimeTemplateTest  new / changed (e4cf4e5c)
  isPrimeTsExists      up to date
  tsIgnoreCount        up to date
  readmeExists         deleted from task; 4 stored measures kept, excluded from aggregates

Recomputed 2 aggregation results.
${NOT_APPLIED}
`,
      stderr: "",
      exitCode: 0,
    };
    for (const order of [
      (dir: string) => ["remeasure", ERRORED, "--data-dir", dir],
      (dir: string) => ["remeasure", "--data-dir", dir, ERRORED],
    ]) {
      const seeded = await seededDataDir();
      const args = order(seeded.dir);
      expect({ args, ...(await thunderjar(fixtures, args, docker.env)) }).toEqual({ args, ...expected });

      const after = read(seeded.store);
      expect(aggregatesOf(after, ERRORED)).toEqual(ERRORED_RECOMPUTED);
      for (const other of [OLDEST, TIMED_OUT, LATEST]) {
        expect(aggregatesOf(after, other)).toEqual(aggregatesOf(starting, other));
      }
      // Every per-run readmeExists, errored or not, and the stale isPrimeTemplateTest are kept as they were.
      expect(after.containerRuns).toEqual(starting.containerRuns);
      const errored = after.containerRuns.filter((r) => r.executionId === ERRORED);
      expect(errored.map((r) => r.result.readmeExists?.outcome.outcome)).toEqual([
        "erroredWhileMeasuring",
        "measured",
        "erroredWhileMeasuring",
        "measured",
      ]);
      expect(errored.map((r) => r.result.isPrimeTemplateTest!.contentHash.slice(0, 8))).toEqual([
        "e4cf4e5c",
        "e4cf4e5c",
        "bb51049d",
        "e4cf4e5c",
      ]);
    }
    expect(docker.commands()).toEqual([]);
  });

  test("remeasure <execution> with every measure current reports each up to date, and still recomputes both its aggregates", async () => {
    const seeded = await seededDataDir();
    const docker = await fakeDocker();
    expect(await thunderjar(fixtures, ["remeasure", LATEST, "--data-dir", seeded.dir], docker.env)).toEqual({
      stdout: `Execution ${LATEST}  (4 container runs)
Current measurements for task is-prime:
  isPrimeTemplateTest  up to date
  isPrimeTsExists      up to date
  tsIgnoreCount        up to date

Recomputed 2 aggregation results.
${NOT_APPLIED}
`,
      stderr: "",
      exitCode: 0,
    });
    // Recomputed from the same Results by the same measurements, so they're as stored.
    expect(read(seeded.store)).toEqual(starting);
    expect(docker.commands()).toEqual([]);
  });

  test("remeasure <test case> reports every execution of it, newest first, and recomputes both permutations of each", async () => {
    const seeded = await seededDataDir();
    const docker = await fakeDocker();
    expect(aggregatesOf(starting, OLDEST)).toEqual([]);
    expect(await thunderjar(fixtures, ["remeasure", "fails", "--data-dir", seeded.dir], docker.env)).toEqual({
      stdout: `fails has 3 executions (12 container runs)
  ${LATEST}  4 runs  2026-09-30  (already current, nothing to do)
  ${ERRORED}  4 runs  2026-09-29
  ${OLDEST}  4 runs  2026-09-28

Recomputed 6 aggregation results.
${NOT_APPLIED}
`,
      stderr: "",
      exitCode: 0,
    });
    const after = read(seeded.store);
    expect(aggregatesOf(after, OLDEST)).toEqual(OLDEST_COMPUTED);
    expect(aggregatesOf(after, ERRORED)).toEqual(ERRORED_RECOMPUTED);
    expect(aggregatesOf(after, LATEST)).toEqual(aggregatesOf(starting, LATEST));
    expect(aggregatesOf(after, TIMED_OUT)).toEqual(aggregatesOf(starting, TIMED_OUT));
    expect(after.containerRuns).toEqual(starting.containerRuns);
    expect(docker.commands()).toEqual([]);
  });

  test("remeasure <test case> keeps runs whose agent exited non-zero: times-out's has nothing to measure, and its duration is still aggregated", async () => {
    const seeded = await seededDataDir();
    const docker = await fakeDocker();
    const expected = {
      stdout: `times-out has 1 execution (2 container runs)
  ${TIMED_OUT}  2 runs  2026-09-29  (already current, nothing to do)

Recomputed 1 aggregation result.
${NOT_APPLIED}
`,
      stderr: "",
      exitCode: 0,
    };
    const args = ["remeasure", "times-out", "--data-dir", seeded.dir];
    expect(await thunderjar(fixtures, args, docker.env)).toEqual(expected);
    const once = readFileSync(seeded.store);
    const after = read(seeded.store);
    expect(aggregatesOf(after, TIMED_OUT)).toEqual([
      { executionId: TIMED_OUT, permutationHash: WAITING, iterations: 2, measures: {}, duration: DURATION },
    ]);
    expect(after.containerRuns).toEqual(starting.containerRuns);

    expect(await thunderjar(fixtures, args, docker.env)).toEqual(expected);
    expect(readFileSync(seeded.store).equals(once)).toBe(true);
    expect(docker.commands()).toEqual([]);
  });

  test("fails for a target that is neither a recorded execution nor a test case, a postrun tag among them", async () => {
    const docker = await fakeDocker();
    for (const target of ["is-even", "postrun-e01k4x9j2e8mqz3abcdefghjkmn-h8ffdda6e-i00"]) {
      expect(await thunderjar(fixtures, ["remeasure", target], docker.env)).toEqual({
        stdout: "",
        stderr: `${target} is not a recorded execution or test case\n`,
        exitCode: 1,
      });
    }
    expect(docker.commands()).toEqual([]);
  });

  test("remeasure --data-dir reads only the store there: an empty one has no executions, and isn't written", async () => {
    const empty = await mkdtemp(join(tmpdir(), "thunderjar-remeasure-"));
    disposable.push(empty);
    const docker = await fakeDocker();
    expect(await thunderjar(fixtures, ["remeasure", ERRORED, "--data-dir", empty], docker.env)).toEqual({
      stdout: "",
      stderr: `${ERRORED} is not a recorded execution or test case\n`,
      exitCode: 1,
    });
    expect(existsSync(join(empty, "runs.json"))).toBe(false);
    expect(docker.commands()).toEqual([]);
  });

  test("prints usage for a missing target, extra arguments, an unknown flag, or a bad --data-dir", async () => {
    const seeded = await seededDataDir();
    const before = readFileSync(seeded.store);
    const docker = await fakeDocker();
    for (const args of [
      ["remeasure"],
      ["remeasure", ERRORED, "fails"],
      ["remeasure", ERRORED, "--force"],
      ["remeasure", "--json", ERRORED],
      ["remeasure", ERRORED, "--data-dir"],
      ["remeasure", "--data-dir", ERRORED],
      ["remeasure", ERRORED, "--data-dir", dataDir, "--data-dir", dataDir],
      ["remeasure", ERRORED, "--data-dir", seeded.dir, "--force"],
    ]) {
      expect({ args, ...(await thunderjar(fixtures, args, docker.env)) }).toEqual({
        args,
        stdout: "",
        stderr: USAGE,
        exitCode: 1,
      });
    }
    expect(readFileSync(seeded.store).equals(before)).toBe(true);
    expect(docker.commands()).toEqual([]);
  });
});
