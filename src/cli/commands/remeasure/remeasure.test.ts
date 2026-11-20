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
import { afterEach, describe, expect, test } from "bun:test";
import { $ } from "bun";
import { type ContainerRunRecord, sqliteStore } from "../../../store/runDataStore.ts";
import { copyScenarioProject, type ProjectCopy, thunderjar } from "../../../testing/cli.ts";
import { type FakeDocker, fakeDocker } from "../../../testing/fakeDocker.ts";

/** Two-harnesses: 2 container runs, 1-1 and 2-1, started 2026-10-02. */
const TWO_HARNESSES = "01m3ygz4g89aqh8yey8em0twpq";
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
});
