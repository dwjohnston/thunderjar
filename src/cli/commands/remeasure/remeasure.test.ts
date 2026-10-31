// `thunderjar remeasure`, through the CLI, in place in fixtureTests/scenario_8_recorded_executions,
// which starts with a run data store of four executions. An execution prints its plan: each
// current measurement's status, and each deleted name with its stored measures. A test case
// lists every execution of it, and which have nothing to do. Then each run's missing or stale
// measures are taken from its postrun image, through the recording fake Docker, which is given
// the scenario's two saved postrun workspaces and copies them out; nothing runs in a container.
// Every aggregation result of each execution given is recomputed from the Results then stored,
// even with nothing to measure. A successful remeasure writes to a disposable copy of the store,
// given with `--data-dir`; the checked-in store and saved workspaces are left as they were. Each
// asserts on stdout, stderr and the exit code. Any of these can be run by hand, with an absolute
// `--data-dir` holding a copy of the scenario's `.thunderjar/.data/runs.json`, though by hand the
// postrun images must exist in the real Docker:
//
//   bun run fixture 8 remeasure 01k4x9j2e8mqz3abcdefghjkmn --data-dir <dir>
//   bun run fixture 8 remeasure fails --data-dir <dir>

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fakeDocker, scenario, thunderjar } from "../../../testing/cli.ts";
import type { AggregationResult, ContainerRunRecord, RecordedMeasure, Result } from "../../../store/run-data-store.ts";

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

/** ERRORED's behaving run measured with the older template, so its isPrimeTemplateTest is stale. */
const STALE_RUN = `postrun-e${ERRORED}-h8ffdda6e-i00`;
/** OLDEST's behaving run that exited 3 and was never measured. */
const UNMEASURED_RUN = `postrun-e${OLDEST}-h8ffdda6e-i01`;

/** The current measurements' full content hashes. */
const HASH = {
  isPrimeTemplateTest: "e4cf4e5c3ec40d0d5373b9a92c23e7a90d30500caef60d7e1df608258cd2a6cd",
  isPrimeTsExists: "e514c7262f9be694b4f4eb151381431b9e99c39b660739f5238f3a1637be63ed",
  tsIgnoreCount: "383b2dc3ebbb7aed32c3f0cb6cd13ee824eae5aec189deaa66b7cb30e9b1b492",
};

const FOOTER = "The agent was not rerun.";

/** Every container run takes 0.04s in this scenario. */
const DURATION = { mean: 40, max: 40 };

/** The failing agent's aggregation result in each execution of `fails`: it never writes isPrime.ts. */
const failingAggregate = (executionId: string): AggregationResult => ({
  executionId,
  permutationHash: FAILING,
  iterations: 2,
  measures: {
    isPrimeTemplateTest: { measured: 0 },
    isPrimeTsExists: { measured: 2, rate: 0 },
    tsIgnoreCount: { measured: 0 },
  },
  duration: DURATION,
});

/** The behaving agent's aggregation result with both iterations measured, without the deleted readmeExists. */
const behavingAggregate = (executionId: string): AggregationResult => ({
  executionId,
  permutationHash: BEHAVING,
  iterations: 2,
  measures: {
    isPrimeTemplateTest: { measured: 2, mean: { passed: 3, failed: 2 }, sum: { passed: 6, failed: 4 } },
    isPrimeTsExists: { measured: 2, rate: 1 },
    tsIgnoreCount: { measured: 2, median: 1, min: 1, sum: 2 },
  },
  duration: DURATION,
});

/** ERRORED's aggregation results recomputed: as stored, without the deleted readmeExists. */
const ERRORED_RECOMPUTED = [failingAggregate(ERRORED), behavingAggregate(ERRORED)];

/** OLDEST's aggregation results, which it had none of, once its behaving agent's second run is measured. */
const OLDEST_BACKFILLED = [failingAggregate(OLDEST), behavingAggregate(OLDEST)];

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

/** A measure taken today, of today's measurement `name`; its `measuredAt` is checked by `takenBetween`. */
const taken = (name: keyof typeof HASH, instrument: string, data: unknown): RecordedMeasure => ({
  instrument,
  contentHash: HASH[name],
  measuredAt: expect.any(String) as unknown as string,
  outcome: { outcome: "measured", data },
});

/** `records`, with `measures` merged into the Result of each run named, as a backfill stores them. */
const withMeasures = (records: ContainerRunRecord[], measures: Record<string, Result>) =>
  records.map((record) =>
    measures[record.postrunImage] ? { ...record, result: { ...record.result, ...measures[record.postrunImage] } } : record,
  );

/** Asserts each of `names` in `postrunImage`'s stored Result was dated, as a valid ISO time, between `from` and `to`. */
function takenBetween(file: StoreFile, postrunImage: string, names: string[], from: number, to: number) {
  const { result } = file.containerRuns.find((r) => r.postrunImage === postrunImage)!;
  for (const name of names) {
    const { measuredAt } = result[name]!;
    expect(new Date(measuredAt).toISOString()).toBe(measuredAt);
    expect(Date.parse(measuredAt)).toBeGreaterThanOrEqual(from);
    expect(Date.parse(measuredAt)).toBeLessThanOrEqual(to);
  }
}

/**
 * The fake Docker's commands, each measurement's container and scratch folder numbered in the
 * order first seen, since their names are random.
 */
function protocol(commands: string[]) {
  const seen = { container: [] as string[], scratch: [] as string[] };
  const number = (kind: keyof typeof seen) => (match: string) => {
    if (!seen[kind].includes(match)) seen[kind].push(match);
    return `<${kind} ${seen[kind].indexOf(match) + 1}>`;
  };
  return commands.map((line) =>
    line
      .replaceAll(new RegExp(`${tmpdir().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/thunderjar-measure-[^/ ]+`, "g"), number("scratch"))
      .replaceAll(/thunderjar-measure-[0-9a-f]{8}/g, number("container")),
  );
}

/** What opening the `n`th measurement's context of `tag` asks the fake Docker, then closing it. */
const opened = (n: number, tag: string) => [
  `docker create --name <container ${n}> --entrypoint sh thunderjar:${tag}`,
  `docker cp <container ${n}>:/workspace/. <scratch ${n}>/workspace`,
  `docker cp <container ${n}>:/thunderjar/result.json <scratch ${n}>/result.json`,
  `docker rm --force <container ${n}>`,
];

/** Every file's bytes under `dir`, by relative path. */
const snapshot = (dir: string) =>
  Object.fromEntries(
    (readdirSync(dir, { recursive: true }) as string[])
      .filter((path) => statSync(join(dir, path)).isFile())
      .toSorted()
      .map((path) => [path, readFileSync(join(dir, path), "utf8")]),
  );

describe("scenario_8_recorded_executions", () => {
  const fixtures = scenario("scenario_8_recorded_executions");
  const dataDir = join(fixtures, ".thunderjar", ".data");
  const store = join(dataDir, "runs.json");
  const checkedIn = readFileSync(store);
  const starting = read(store);
  const saved = join(fixtures, "..", "postrun-files");
  const savedFiles = snapshot(saved);

  const disposable: string[] = [];
  /** A disposable data directory, holding an exact copy of the checked-in store. */
  const seededDataDir = async () => {
    const dir = await mkdtemp(join(tmpdir(), "thunderjar-remeasure-"));
    disposable.push(dir);
    await copyFile(store, join(dir, "runs.json"));
    return { dir, store: join(dir, "runs.json") };
  };

  const fakes: Awaited<ReturnType<typeof fakeDocker>>[] = [];
  /** A disposable fake Docker in which both runs with saved files are postrun images. */
  const savedPostruns = async () => {
    const docker = await fakeDocker([], [], {
      [`thunderjar:${STALE_RUN}`]: join(saved, ERRORED, STALE_RUN),
      [`thunderjar:${UNMEASURED_RUN}`]: join(saved, OLDEST, UNMEASURED_RUN),
    });
    fakes.push(docker);
    return docker;
  };

  afterEach(async () => {
    expect(readFileSync(store).equals(checkedIn)).toBe(true);
    expect(snapshot(saved)).toEqual(savedFiles);
    for (const docker of fakes.splice(0)) {
      // Every measurement container is removed once its files are copied out.
      expect(docker.containers()).toEqual([]);
      await docker.remove();
    }
    for (const dir of disposable.splice(0)) await rm(dir, { recursive: true, force: true });
  });

  test("remeasure <execution> retakes only its stale isPrimeTemplateTest, keeps the deleted readmeExists, and recomputes both its aggregates without readmeExists", async () => {
    const expected = {
      stdout: `Execution ${ERRORED}  (4 container runs)
Current measurements for task is-prime:
  isPrimeTemplateTest  new / changed (e4cf4e5c)
  isPrimeTsExists      up to date
  tsIgnoreCount        up to date
  readmeExists         deleted from task; 4 stored measures kept, excluded from aggregates

Measuring from each postrun image:
  8ffdda6e i00  isPrimeTemplateTest  {passed: 3, failed: 2}

Updated 1 container run. Recomputed 2 aggregation results.
${FOOTER}
`,
      stderr: "",
      exitCode: 0,
    };
    for (const order of [
      (dir: string) => ["remeasure", ERRORED, "--data-dir", dir],
      (dir: string) => ["remeasure", "--data-dir", dir, ERRORED],
    ]) {
      const seeded = await seededDataDir();
      const docker = await savedPostruns();
      const args = order(seeded.dir);
      const from = Date.now();
      expect({ args, ...(await thunderjar(fixtures, args, docker.env)) }).toEqual({ args, ...expected });
      const to = Date.now();

      const after = read(seeded.store);
      takenBetween(after, STALE_RUN, ["isPrimeTemplateTest"], from, to);
      // Every other measure, the deleted readmeExists among them, and every run's metadata are as they were.
      expect(after.containerRuns).toEqual(
        withMeasures(starting.containerRuns, {
          [STALE_RUN]: { isPrimeTemplateTest: taken("isPrimeTemplateTest", "templateTest", { passed: 3, failed: 2 }) },
        }),
      );
      expect(aggregatesOf(after, ERRORED)).toEqual(ERRORED_RECOMPUTED);
      for (const other of [OLDEST, TIMED_OUT, LATEST]) {
        expect(aggregatesOf(after, other)).toEqual(aggregatesOf(starting, other));
      }
      const errored = after.containerRuns.filter((r) => r.executionId === ERRORED);
      expect(errored.map((r) => r.result.readmeExists?.outcome.outcome)).toEqual([
        "erroredWhileMeasuring",
        "measured",
        "erroredWhileMeasuring",
        "measured",
      ]);
      expect(protocol(docker.commands())).toEqual(opened(1, STALE_RUN));
    }
  });

  test("show against a store remeasure <execution> updated marks neither the retaken value nor its aggregate stale, and has no readmeExists aggregate", async () => {
    const seeded = await seededDataDir();
    const docker = await savedPostruns();
    expect((await thunderjar(fixtures, ["remeasure", ERRORED, "--data-dir", seeded.dir], docker.env)).exitCode).toBe(0);

    expect(await thunderjar(fixtures, ["show", ERRORED, "--data-dir", seeded.dir], docker.env)).toEqual({
      stdout: `Execution  ${ERRORED}
Test case  fails
Task       is-prime
Date       2026-09-29 14:30

Permutation 42440c48  (2 iterations)
  node20 | baseline | snerk | fake-harness-alpha@1.0.1/fake-model-small | plain

  MEASURE              MEASURED  AGGREGATE
  isPrimeTemplateTest  0/2       —
  isPrimeTsExists      2/2       rate 0.00
  tsIgnoreCount        0/2       —

  exit       2/2 exited 3
  duration   mean 0.04s, max 0.04s

Permutation 8ffdda6e  (2 iterations)
  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | plain

  MEASURE              MEASURED  AGGREGATE
  isPrimeTemplateTest  2/2       mean {passed: 3.0, failed: 2.0}, sum {passed: 6, failed: 4}
  isPrimeTsExists      2/2       rate 1.00
  tsIgnoreCount        2/2       median 1.0, min 1, sum 2

  exit       2/2 exited 0
  duration   mean 0.04s, max 0.04s
`,
      stderr: "",
      exitCode: 0,
    });
    expect(await thunderjar(fixtures, ["show", STALE_RUN, "--data-dir", seeded.dir], docker.env)).toEqual({
      stdout: `Container run  ${STALE_RUN}
Execution      ${ERRORED}  (fails)
Permutation    8ffdda6e, iteration 1
Ran at         2026-09-29 14:30

Parameters
  baseImage      node20                                     26d9
  codeState      baseline                                   bb15
  promptSet      snerk                                      827a
  harnessModel   fake-harness-alpha@1.0.0/fake-model-small  da28
  initialPrompt  plain                                      9e30

Measures
  isPrimeTemplateTest  {passed: 3, failed: 2}
  isPrimeTsExists      true
  readmeExists         error  (disk on fire)
  tsIgnoreCount        1

Duration  0.04s   exit code 0
`,
      stderr: "",
      exitCode: 0,
    });
    // `show` only reads.
    expect(protocol(docker.commands())).toEqual(opened(1, STALE_RUN));
  });

  test("remeasure <execution> takes each of a run's missing measures from its postrun image, one context each, in name order", async () => {
    const seeded = await seededDataDir();
    const docker = await savedPostruns();
    const from = Date.now();
    expect(await thunderjar(fixtures, ["remeasure", OLDEST, "--data-dir", seeded.dir], docker.env)).toEqual({
      stdout: `Execution ${OLDEST}  (4 container runs)
Current measurements for task is-prime:
  isPrimeTemplateTest  new / changed (e4cf4e5c)
  isPrimeTsExists      new / changed (e514c726)
  tsIgnoreCount        new / changed (383b2dc3)
  readmeExists         deleted from task; 3 stored measures kept, excluded from aggregates

Measuring from each postrun image:
  8ffdda6e i01  isPrimeTemplateTest  {passed: 3, failed: 2}
  8ffdda6e i01  isPrimeTsExists      true
  8ffdda6e i01  tsIgnoreCount        1

Updated 1 container run. Recomputed 2 aggregation results.
${FOOTER}
`,
      stderr: "",
      exitCode: 0,
    });
    const to = Date.now();
    const after = read(seeded.store);
    takenBetween(after, UNMEASURED_RUN, Object.keys(HASH), from, to);
    expect(aggregatesOf(after, OLDEST)).toEqual(OLDEST_BACKFILLED);
    expect(protocol(docker.commands())).toEqual([1, 2, 3].flatMap((n) => opened(n, UNMEASURED_RUN)));
  });

  test("remeasure <execution> with every measure current reports each up to date and nothing to do, opens no context, and still recomputes both its aggregates", async () => {
    const seeded = await seededDataDir();
    const docker = await savedPostruns();
    expect(await thunderjar(fixtures, ["remeasure", LATEST, "--data-dir", seeded.dir], docker.env)).toEqual({
      stdout: `Execution ${LATEST}  (4 container runs)
Current measurements for task is-prime:
  isPrimeTemplateTest  up to date
  isPrimeTsExists      up to date
  tsIgnoreCount        up to date

Already current, nothing to do.
Updated 0 container runs. Recomputed 2 aggregation results.
${FOOTER}
`,
      stderr: "",
      exitCode: 0,
    });
    // Recomputed from the same Results by the same measurements, so they're as stored.
    expect(read(seeded.store)).toEqual(starting);
    expect(docker.commands()).toEqual([]);
  });

  test("remeasure <test case> backfills every execution of it, the run that exited 3 among them, and recomputes both permutations of each", async () => {
    const seeded = await seededDataDir();
    const docker = await savedPostruns();
    expect(aggregatesOf(starting, OLDEST)).toEqual([]);
    const from = Date.now();
    expect(await thunderjar(fixtures, ["remeasure", "fails", "--data-dir", seeded.dir], docker.env)).toEqual({
      stdout: `fails has 3 executions (12 container runs)
  ${LATEST}  4 runs  2026-09-30  (already current, nothing to do)
  ${ERRORED}  4 runs  2026-09-29
  ${OLDEST}  4 runs  2026-09-28

Measuring 2 container runs...  done
Updated 2 container runs. Recomputed 6 aggregation results.
${FOOTER}
`,
      stderr: "",
      exitCode: 0,
    });
    const to = Date.now();

    const after = read(seeded.store);
    takenBetween(after, STALE_RUN, ["isPrimeTemplateTest"], from, to);
    takenBetween(after, UNMEASURED_RUN, Object.keys(HASH), from, to);
    // The latest execution's records, and every untouched measure and run's metadata, are as they were.
    expect(after.containerRuns).toEqual(
      withMeasures(starting.containerRuns, {
        [STALE_RUN]: { isPrimeTemplateTest: taken("isPrimeTemplateTest", "templateTest", { passed: 3, failed: 2 }) },
        [UNMEASURED_RUN]: {
          isPrimeTemplateTest: taken("isPrimeTemplateTest", "templateTest", { passed: 3, failed: 2 }),
          isPrimeTsExists: taken("isPrimeTsExists", "fileCreated", true),
          tsIgnoreCount: taken("tsIgnoreCount", "grep", 1),
        },
      }),
    );
    expect(after.containerRuns.find((r) => r.postrunImage === UNMEASURED_RUN)!.execution.exitCode).toBe(3);
    expect(aggregatesOf(after, OLDEST)).toEqual(OLDEST_BACKFILLED);
    expect(aggregatesOf(after, ERRORED)).toEqual(ERRORED_RECOMPUTED);
    expect(aggregatesOf(after, LATEST)).toEqual(aggregatesOf(starting, LATEST));
    expect(aggregatesOf(after, TIMED_OUT)).toEqual(aggregatesOf(starting, TIMED_OUT));
    // Executions newest first, each run's measurements in name order.
    expect(protocol(docker.commands())).toEqual([
      ...opened(1, STALE_RUN),
      ...opened(2, UNMEASURED_RUN),
      ...opened(3, UNMEASURED_RUN),
      ...opened(4, UNMEASURED_RUN),
    ]);
  });

  test("remeasure again against the store it updated has nothing to do, opens no context, and leaves the store byte for byte as it was", async () => {
    for (const [target, again] of [
      [
        ERRORED,
        `Execution ${ERRORED}  (4 container runs)
Current measurements for task is-prime:
  isPrimeTemplateTest  up to date
  isPrimeTsExists      up to date
  tsIgnoreCount        up to date
  readmeExists         deleted from task; 4 stored measures kept, excluded from aggregates

Already current, nothing to do.
Updated 0 container runs. Recomputed 2 aggregation results.
${FOOTER}
`,
      ],
      [
        "fails",
        `fails has 3 executions (12 container runs)
  ${LATEST}  4 runs  2026-09-30  (already current, nothing to do)
  ${ERRORED}  4 runs  2026-09-29  (already current, nothing to do)
  ${OLDEST}  4 runs  2026-09-28  (already current, nothing to do)

Already current, nothing to do.
Updated 0 container runs. Recomputed 6 aggregation results.
${FOOTER}
`,
      ],
    ] as const) {
      const seeded = await seededDataDir();
      const docker = await savedPostruns();
      const args = ["remeasure", target, "--data-dir", seeded.dir];
      expect((await thunderjar(fixtures, args, docker.env)).exitCode).toBe(0);
      const once = readFileSync(seeded.store);
      const commands = docker.commands();

      expect({ target, ...(await thunderjar(fixtures, args, docker.env)) }).toEqual({
        target,
        stdout: again,
        stderr: "",
        exitCode: 0,
      });
      expect(readFileSync(seeded.store).equals(once)).toBe(true);
      expect(docker.commands()).toEqual(commands);
    }
  });

  test("remeasure <test case> keeps runs whose agent exited non-zero: times-out's has nothing to measure, opens no context, and its duration is still aggregated", async () => {
    const seeded = await seededDataDir();
    const docker = await savedPostruns();
    const expected = {
      stdout: `times-out has 1 execution (2 container runs)
  ${TIMED_OUT}  2 runs  2026-09-29  (already current, nothing to do)

Already current, nothing to do.
Updated 0 container runs. Recomputed 1 aggregation result.
${FOOTER}
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
    const docker = await savedPostruns();
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
    const docker = await savedPostruns();
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
    const docker = await savedPostruns();
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
