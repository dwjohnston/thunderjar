/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiw2YB851n82Y1sd8t
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */

// `thunderjar remeasure`, through the CLI, with the fake Docker, on a copy of 0203's project, whose
// own run data store it writes. Each postrun image exists in the fake, its files only those a test
// gives it.
import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { $ } from "bun";
import { type ContainerRunRecord, sqliteStore } from "../../../store/runDataStore.ts";
import { copyScenarioProject, type ProjectCopy, thunderjar } from "../../../testing/cli.ts";
import { type FakeDocker, fakeDocker } from "../../../testing/fakeDocker.ts";
import { scenario } from "../../../testing/scenario.ts";

/** Two-harnesses: 2 container runs, 1-1 and 2-1, started 2026-10-02. */
const TWO_HARNESSES = "01m3ygz4g89aqh8yey8em0twpq";
/** Two-harnesses again: 2 container runs, 1-1 and 2-1, started 2026-10-04. */
const TWO_HARNESSES_AGAIN = "01m430hgt00w0g80g80m3g2102";
/** Is-prime-baseline: 40 container runs. */
const BASELINE = "01m3vf68s54p5eyn5s3t1ygkdj";
const postrun = (id: string, run: string) => `thunderjar-postrun:${id}-${run}`;
const MEASUREMENTS = ".thunderjar/parameters/tasks/is-prime/measurements";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function project(): Promise<ProjectCopy> {
  const copy = await copyScenarioProject("0203");
  cleanups.push(copy.remove);
  return copy;
}

/** The fake Docker, in which `images` exist. */
async function docker(images: string[]): Promise<FakeDocker> {
  const fake = await fakeDocker({ images });
  cleanups.push(fake.remove);
  return fake;
}

/** Writes `contents` to `path`, under /workspace, in `image`'s files, as if its agent had left it. */
const leave = (docker: FakeDocker, image: string, path: string, contents: string) =>
  Bun.write(`${docker.env.FAKE_DOCKER_DIR}/filesystems/${encodeURIComponent(image)}/workspace/${path}`, contents);

/** Changes 0203's tsIgnoreCount to count `@ts-expect-error` lines instead. */
const countExpectErrors = (copy: ProjectCopy) =>
  Bun.write(
    `${copy.dir}/${MEASUREMENTS}/tsIgnoreCount.ts`,
    `import { declareMeasurement } from "thunderjar";\n\nexport default declareMeasurement({\n  instrument: "grep",\n  config: { glob: "**/*.ts", pattern: "@ts-expect-error" },\n  metrics: { count: { stat: "mean" } },\n});\n`,
  );

const runsOf = (copy: ProjectCopy, executionId: string) => sqliteStore(`${copy.dir}/.thunderjar/.data/runs.sqlite`).containerRunsOf(executionId);

describe("remeasure", () => {
  test("an execution: each of its runs is measured again, by the measurements as they are now, and its earlier measures kept beside the new", async () => {
    const copy = await project();
    const [before1, before2] = (await runsOf(copy, TWO_HARNESSES)) as [ContainerRunRecord, ContainerRunRecord];
    const fake = await docker([postrun(TWO_HARNESSES, "1-1"), postrun(TWO_HARNESSES, "2-1")]);
    await leave(fake, postrun(TWO_HARNESSES, "1-1"), "isPrime.ts", "// @ts-expect-error\n// @ts-expect-error\nexport const isPrime = 1;\n");
    await countExpectErrors(copy);

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["remeasure", TWO_HARNESSES], { env: fake.env });

    expect({ stdout, stderr, exitCode }).toEqual({ stdout: "remeasured 2 runs\n", stderr: "", exitCode: 0 });
    const [after1, after2] = (await runsOf(copy, TWO_HARNESSES)) as [ContainerRunRecord, ContainerRunRecord];
    expect(Object.keys(after1.result).toSorted()).toEqual(["isPrimeShape", "isPrimeTests", "isPrimeTsExists", "tsIgnoreCount"]);
    expect(after1.result.tsIgnoreCount!.outcome).toEqual({ outcome: "measured", data: 2 });
    expect(after1.result.tsIgnoreCount!.contentHash).not.toBe(before1.result.tsIgnoreCount!.contentHash);
    expect(after1.result.isPrimeTsExists!.outcome).toEqual({ outcome: "measured", data: true });
    expect(after2.result.isPrimeTsExists!.outcome).toEqual({ outcome: "measured", data: false });
    expect(after1.earlierResults).toEqual([before1.result]);
    expect(after2.earlierResults).toEqual([before2.result]);
    // Everything else about each run is as it was.
    const { result: _1, earlierResults: _2, ...rest } = after1;
    const { result: _3, ...restBefore } = before1;
    expect(rest).toEqual(restBefore);
    expect(await $`ls ${fake.env.FAKE_DOCKER_DIR}/containers`.quiet().nothrow().text()).toBe("");
  });

  test("a test case: the runs of every past execution of it are measured again, and no other's", async () => {
    const copy = await project();
    const fake = await docker([TWO_HARNESSES, TWO_HARNESSES_AGAIN].flatMap((id) => [postrun(id, "1-1"), postrun(id, "2-1")]));

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["remeasure", "two-harnesses"], { env: fake.env });

    expect({ stdout, stderr, exitCode }).toEqual({ stdout: "remeasured 4 runs\n", stderr: "", exitCode: 0 });
    for (const id of [TWO_HARNESSES, TWO_HARNESSES_AGAIN]) {
      expect((await runsOf(copy, id)).map((run) => run.earlierResults?.length)).toEqual([1, 1]);
    }
    expect((await runsOf(copy, BASELINE)).filter((run) => run.earlierResults !== undefined)).toEqual([]);
  });

  test("a run whose postrun image was purged is skipped, and listed as skipped", async () => {
    const copy = await project();
    await sqliteStore(`${copy.dir}/.thunderjar/.data/runs.sqlite`).markPostrunsPurged(TWO_HARNESSES, { purgedAt: "2026-10-05T00:00:00.000Z", from: "daemon" }, [
      { permutation: 2, iteration: 1 },
    ]);
    const [, before2] = (await runsOf(copy, TWO_HARNESSES)) as [ContainerRunRecord, ContainerRunRecord];
    const fake = await docker([postrun(TWO_HARNESSES, "1-1")]);

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["remeasure", TWO_HARNESSES], { env: fake.env });

    expect({ stdout, stderr, exitCode }).toEqual({
      stdout: `remeasured 1 run, skipped 1 (postrun image purged)\n  <ULID> 2-1  postrun image purged\n`,
      stderr: "",
      exitCode: 0,
    });
    const [after1, after2] = (await runsOf(copy, TWO_HARNESSES)) as [ContainerRunRecord, ContainerRunRecord];
    expect(after1.earlierResults).toHaveLength(1);
    expect(after2).toEqual(before2);
  });

  test("a run whose container never started has no postrun image: it's skipped, and listed as skipped", async () => {
    const copy = await project();
    const db = new Database(`${copy.dir}/.thunderjar/.data/runs.sqlite`, { strict: true });
    db.query("UPDATE container_runs SET record = json_set(record, '$.execution.failedToStart', 'no such image') WHERE execution_id = $id AND permutation = 2").run({ id: TWO_HARNESSES });
    db.close();
    const fake = await docker([postrun(TWO_HARNESSES, "1-1")]);

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["remeasure", TWO_HARNESSES], { env: fake.env });

    expect({ stdout, stderr, exitCode }).toEqual({ stdout: "remeasured 1 run, skipped 1 (never started)\n  <ULID> 2-1  never started\n", stderr: "", exitCode: 0 });
  });

  test("an execution or test case with nothing recorded is an error", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0203"), ["remeasure", "two-harness"]);

    expect({ stdout, stderr, exitCode }).toEqual({
      stdout: "",
      stderr: "Error: No execution or test case two-harness recorded. List the executions with `thunderjar executions`.\n",
      exitCode: 1,
    });
  });
});
