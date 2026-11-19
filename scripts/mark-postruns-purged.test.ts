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

// The mark-postruns-purged script, on copies of 0203's store, never on the scenario's own.
import { $ } from "bun";
import { afterEach, expect, test } from "bun:test";
import { sqliteStore, storeFileIn } from "../src/store/runDataStore.ts";
import { TMP_DIR } from "../src/testing/cli.ts";
import { scenario } from "../src/testing/scenario.ts";
import { markPostrunsPurged } from "./mark-postruns-purged.ts";

/** Two-harnesses, 2 container runs. */
const TWO_HARNESSES = "01m3ygz4g89aqh8yey8em0twpq";
/** Is-prime-baseline, 40 container runs. */
const BASELINE = "01m3vf68s54p5eyn5s3t1ygkdj";
const PURGE = { purgedAt: "2026-11-19T09:00:00.000Z", from: "imageStore", reason: "held leaked keys" } as const;

const dirs: string[] = [];

/** A copy of 0203's store, as a data dir removed after the test. */
async function copyOfStore(): Promise<string> {
  const dir = `${TMP_DIR}/data-${crypto.randomUUID()}`;
  dirs.push(dir);
  await $`mkdir -p ${dir} && cp -R ${scenario("0203")}/.thunderjar/.data/. ${dir}`.quiet();
  return dir;
}

afterEach(async () => {
  for (const dir of dirs.splice(0)) await $`rm -rf ${dir}`.quiet();
});

test("marks the given executions' runs, and counts them", async () => {
  const store = sqliteStore(storeFileIn(await copyOfStore()));

  expect(await markPostrunsPurged(store, { executionIds: [TWO_HARNESSES], all: false, purge: PURGE, dryRun: false })).toEqual([
    `${TWO_HARNESSES}  2 runs`,
    "Marked 2 container runs purged.",
  ]);
  expect((await store.containerRunsOf(TWO_HARNESSES)).map((run) => run.postrunPurge)).toEqual([PURGE, PURGE]);
  expect((await store.containerRunsOf(BASELINE)).every((run) => run.postrunPurge === undefined)).toBe(true);
});

test("--dry-run marks nothing, and says what it would, and which were purged already", async () => {
  const store = sqliteStore(storeFileIn(await copyOfStore()));
  await store.markPostrunsPurged(TWO_HARNESSES, PURGE, [{ permutation: 1, iteration: 1 }]);

  expect(await markPostrunsPurged(store, { executionIds: [], all: true, purge: PURGE, dryRun: true })).toEqual([
    "01m430hgt00w0g80g80m3g2102  2 runs",
    `${TWO_HARNESSES}  2 runs (1 already purged)`,
    `${BASELINE}  40 runs`,
    "Would mark 44 container runs purged. Nothing was changed.",
  ]);
  expect((await store.containerRunsOf(BASELINE)).every((run) => run.postrunPurge === undefined)).toBe(true);
});

test("an execution not recorded, or IDs with --all, or neither, is an error, and marks nothing", async () => {
  const store = sqliteStore(storeFileIn(await copyOfStore()));
  const mark = (executionIds: string[], all: boolean) => markPostrunsPurged(store, { executionIds, all, purge: PURGE, dryRun: false }).catch((error: Error) => error.message);

  expect(await mark([TWO_HARNESSES, "nope"], false)).toBe("No execution nope recorded. Nothing was marked.");
  expect(await mark([TWO_HARNESSES], true)).toBe("Give execution IDs, or --all, not both.");
  expect(await mark([], false)).toBe("Give execution IDs, or --all, not both.");
  expect((await store.containerRunsOf(TWO_HARNESSES)).every((run) => run.postrunPurge === undefined)).toBe(true);
});

test("run by hand, on --data-dir", async () => {
  const data = await copyOfStore();
  const script = `${import.meta.dir}/mark-postruns-purged.ts`;

  const result = await $`bun ${script} --from both --reason ${"held leaked keys"} --at 2026-11-19T09:00:00Z --data-dir ${data} ${TWO_HARNESSES}`.cwd(TMP_DIR).nothrow().quiet();

  expect(result.stdout.toString()).toBe(`Marking in ${storeFileIn(data)}\n${TWO_HARNESSES}  2 runs\nMarked 2 container runs purged.\n`);
  expect(result.exitCode).toBe(0);
  expect((await sqliteStore(storeFileIn(data)).containerRunsOf(TWO_HARNESSES))[0]!.postrunPurge).toEqual({ ...PURGE, from: "both" });
});
